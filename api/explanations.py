"""Grounded-explanation service.

Maps a user id -> persona fixture -> real dedup run -> grounded narration from the
engine's explainer. The narration is generated from actual engine output (never
hand-written copy), and every number in it is verified against the engine's figures
before it is served.

Client selection:
  * If ``ANTHROPIC_API_KEY`` and the ``anthropic`` SDK are available, the live model
    writes the narration.
  * Otherwise a deterministic offline stub does, so the demo renders real, grounded
    narration with no credentials.
An unavailable model or ungrounded live response falls back to offline narration.

Ported from the retired ``backend/app`` service; it now sits in the canonical ``api``
app and loads data through the :class:`~api.providers.DataProvider` seam.
"""

from __future__ import annotations

import os
from typing import Dict, List

from engine.communal.insights import build_insights
from engine.explainer import (
    AnthropicExplainerClient,
    Explainer,
    ExplainerClient,
    StubExplainerClient,
    UngroundedExplanation,
)
from engine.explainer.communal import CommunalExplainer
from engine.explainer.client import ExplainerUnavailable
from engine.explainer.explainer import DEFAULT_MODEL
from engine.schemas.communal import CommunalInsight
from engine.schemas.dedup import DedupResult
from engine.schemas.transaction import UserProfile

from . import service
from .audit import AuditLog
from .consent import ConsentStore, consented_batch
from .corrections import CorrectionsLog
from .providers import DataProvider
from .schemas import ExplanationItem, ExplanationsResponse, UserSummary


def list_user_profiles(provider: DataProvider) -> List[UserSummary]:
    """The demo roster: every user the provider can serve, with headline counts."""
    out: List[UserSummary] = []
    for user_id in provider.list_users():
        batch = provider.get_batch(user_id)
        out.append(
            UserSummary(
                id=batch.user.user_id,
                name=batch.user.full_name,
                accounts=len(batch.user.account_ids),
                transactions=len(batch.transactions),
            )
        )
    return out


def _make_client() -> ExplainerClient:
    if os.environ.get("AJORA_EXPLAINER") != "offline" and AnthropicExplainerClient.available():
        return AnthropicExplainerClient(model=DEFAULT_MODEL)
    return StubExplainerClient()


def explanations_for(
    provider: DataProvider,
    consent_store: ConsentStore,
    audit_log: AuditLog,
    user_id: str,
    corrections_log: CorrectionsLog,
) -> ExplanationsResponse:
    """Grounded narration of a user's real engine output.

    Produces one ``dedup`` explanation plus one entry per communal relationship
    (ajo/esusu, dependent, informal lending, remittance), each keyed
    ``"{relationship_type}:{counterparty}"``. Every entry's numbers are verified against
    the engine's own figures; an ungrounded live result falls back to the (grounded)
    offline stub rather than serving an invented number.

    Loads through the consent seam like every other data endpoint, so revoked accounts
    are excluded before the narrated numbers are computed, and the access is audited.
    """
    batch = consented_batch(provider, consent_store, audit_log, user_id, "explanations")
    result = service._run_dedup(batch, corrections_log)
    insights = build_insights(result, batch.user).insights
    client = _make_client()
    try:
        items = _narrate(client, result, insights, batch.user)
    except (UngroundedExplanation, ExplainerUnavailable):
        if isinstance(client, StubExplainerClient):
            raise
        # Regenerate the whole response so provenance is accurate, and a failed
        # provider isn't called repeatedly while generating the remaining items.
        client = StubExplainerClient()
        items = _narrate(client, result, insights, batch.user)

    return ExplanationsResponse(
        userId=batch.user.user_id,
        userName=batch.user.full_name,
        generatedBy="stub-offline" if isinstance(client, StubExplainerClient) else DEFAULT_MODEL,
        explanations=items,
    )


def _narrate(
    client: ExplainerClient, result: DedupResult, insights: List[CommunalInsight], user: UserProfile
) -> Dict[str, ExplanationItem]:
    res = Explainer(client).explain(result, user)
    explanations = {
        "dedup": ExplanationItem(
            insightKey="dedup",
            narration=res.text,
            grounded=res.grounding.ok,
            facts=res.facts,
        )
    }

    communal = CommunalExplainer(client)
    for ins in insights:
        cres = communal.explain(ins, user)
        key = f"{ins.relationship_type}:{ins.counterparty}"
        explanations[key] = ExplanationItem(
            insightKey=key,
            narration=cres.text,
            grounded=cres.grounding.ok,
            facts=cres.facts,
        )

    return explanations

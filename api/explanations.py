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
If the live model ever returns an ungrounded explanation we fall back to the
(guaranteed-grounded) stub rather than serve a number the engine did not produce.

Ported from the retired ``backend/app`` service; it now sits in the canonical ``api``
app and loads data through the :class:`~api.providers.DataProvider` seam.
"""

from __future__ import annotations

from typing import List

from engine.communal.insights import build_insights
from engine.dedup import DedupEngine
from engine.explainer import (
    AnthropicExplainerClient,
    Explainer,
    ExplainerClient,
    StubExplainerClient,
    UngroundedExplanation,
)
from engine.explainer.communal import CommunalExplainer
from engine.explainer.explainer import DEFAULT_MODEL

from .audit import AuditLog
from .consent import ConsentStore, consented_batch
from .providers import DataProvider
from .schemas import ExplanationItem, ExplanationsResponse, UserSummary

_ENGINE = DedupEngine()


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
    if AnthropicExplainerClient.available():
        return AnthropicExplainerClient(model=DEFAULT_MODEL)
    return StubExplainerClient()


def explanations_for(
    provider: DataProvider,
    consent_store: ConsentStore,
    audit_log: AuditLog,
    user_id: str,
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
    result = _ENGINE.dedup(batch.transactions, batch.user)

    client = _make_client()
    source = DEFAULT_MODEL if isinstance(client, AnthropicExplainerClient) else "stub-offline"
    stub_fallback_used = False

    # --- dedup explanation ---------------------------------------------------------
    try:
        res = Explainer(client, model=DEFAULT_MODEL).explain(result, batch.user, strict=True)
    except UngroundedExplanation:
        res = Explainer(StubExplainerClient()).explain(result, batch.user, strict=True)
        stub_fallback_used = True

    explanations = {
        "dedup": ExplanationItem(
            insightKey="dedup",
            narration=res.text,
            grounded=res.grounding.ok,
            facts=res.facts,
        )
    }

    # --- one grounded explanation per communal relationship ------------------------
    insights = build_insights(result, batch.user)
    communal = CommunalExplainer(client)
    communal_stub = CommunalExplainer(StubExplainerClient())
    for ins in insights.insights:
        try:
            cres = communal.explain(ins, batch.user, strict=True)
        except UngroundedExplanation:
            cres = communal_stub.explain(ins, batch.user, strict=True)
            stub_fallback_used = True
        key = f"{ins.relationship_type}:{ins.counterparty}"
        explanations[key] = ExplanationItem(
            insightKey=key,
            narration=cres.text,
            grounded=cres.grounding.ok,
            facts=cres.facts,
        )

    used_source = (
        f"{source} (fallback: stub for ungrounded output)" if stub_fallback_used else source
    )
    return ExplanationsResponse(
        userId=batch.user.user_id,
        userName=batch.user.full_name,
        generatedBy=used_source,
        explanations=explanations,
    )

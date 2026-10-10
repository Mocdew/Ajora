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

from engine.dedup import DedupEngine
from engine.explainer import (
    AnthropicExplainerClient,
    Explainer,
    ExplainerClient,
    StubExplainerClient,
    UngroundedExplanation,
)
from engine.explainer.explainer import DEFAULT_MODEL

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


def explanations_for(provider: DataProvider, user_id: str) -> ExplanationsResponse:
    """Grounded narration for every insight we can generate from real engine output.

    Today that is the dedup insight. The ``explanations`` map is keyed by insight so
    communal-finance narration slots in unchanged once that explainer lands.
    """
    batch = provider.get_batch(user_id)
    result = _ENGINE.dedup(batch.transactions, batch.user)

    client = _make_client()
    source = DEFAULT_MODEL if isinstance(client, AnthropicExplainerClient) else "stub-offline"

    try:
        res = Explainer(client, model=DEFAULT_MODEL).explain(result, batch.user, strict=True)
        used_source = source
    except UngroundedExplanation:
        # Never serve a number the engine didn't produce: fall back to the stub,
        # which is grounded by construction.
        res = Explainer(StubExplainerClient()).explain(result, batch.user, strict=True)
        used_source = "stub-offline (fallback: live model was ungrounded)"

    return ExplanationsResponse(
        userId=batch.user.user_id,
        userName=batch.user.full_name,
        generatedBy=used_source,
        explanations={
            "dedup": ExplanationItem(
                insightKey="dedup",
                narration=res.text,
                grounded=res.grounding.ok,
                facts=res.facts,
            )
        },
    )

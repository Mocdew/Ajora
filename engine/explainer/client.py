"""LLM client seam.

`Explainer` depends on the `ExplainerClient` protocol, not on any SDK. That lets the
eval harness run fully offline against `StubExplainerClient` (deterministic, no network,
no key), while production injects `AnthropicExplainerClient`. Same grounding guardrail
runs over whichever client is used.
"""

from __future__ import annotations

import os
from typing import Optional, Protocol

from .prompt import parse_facts_from_prompt


class ExplainerClient(Protocol):
    """Minimal contract: turn a (system, user) prompt pair into completion text."""

    def explain(self, system: str, user: str) -> str: ...


class ExplainerUnavailable(RuntimeError):
    """The live service could not supply narration for this request."""


def _money(value: float) -> str:
    """Format a magnitude with thousands separators; drop the decimals when whole."""
    if float(value) == int(value):
        return "{:,.0f}".format(value)
    return "{:,.2f}".format(value)


def _pct(value: float) -> str:
    # 38.0 -> "38", 12.5 -> "12.5"
    return ("%g" % value)


class StubExplainerClient:
    """Deterministic, offline explainer used by the eval harness.

    It reads the facts back out of the prompt and renders them through fixed templates,
    so its output is grounded *by construction* (every number comes straight from the
    facts). This lets the harness verify the grounding contract and the checks end-to-end
    without a live model or API key.
    """

    def explain(self, system: str, user: str) -> str:  # noqa: D401 - protocol impl
        facts = parse_facts_from_prompt(user)
        totals = facts["totals"]
        name = facts.get("user_first_name") or ""
        hello = f"{name}, " if name else ""

        if facts["match_count"] == 0:
            return (
                f"{hello}no self-transfers have been removed from these figures. "
                f"Income stands at ₦{_money(totals['net_income'])} and spending at "
                f"₦{_money(totals['net_spending'])}."
            )

        lead_transfer = next(
            (move for move in facts["transfers"] if move.get("largest")), facts["transfers"][0]
        )
        description = "The largest move" if lead_transfer.get("largest") else "One move"
        unit = lead_transfer["currency"]
        amount = ("₦" if unit == "NGN" else unit + " ") + _money(lead_transfer["amount"])
        effect = (
            f", so counting it inflated your income by {_pct(totals['income_inflation_pct'])}%"
            if totals["net_income"] > 0
            else ""
        )
        return (
            f"{hello}we found {facts['match_count']} transfer(s) you made between your "
            f"own banks, moving ₦{_money(totals['transfer_volume'])} in total. That "
            f"money is not new income or new spending{effect}. Your real income is "
            f"₦{_money(totals['net_income'])}, not the ₦{_money(totals['gross_income'])} "
            f"a naive view shows. {description}, {amount} "
            f"from {lead_transfer['from_bank']} to {lead_transfer['to_bank']}, is a "
            f"{lead_transfer['tier']}-confidence match ({lead_transfer['confidence_pct']}%)."
        )


class AnthropicExplainerClient:
    """Production client backed by the Anthropic SDK.

    Imported lazily and only constructed when the SDK and an API key are available, so
    the package (and the eval harness) import cleanly with neither installed.
    """

    def __init__(self, model: str, api_key: Optional[str] = None, max_tokens: int = 400) -> None:
        try:
            import anthropic  # noqa: F401
        except ImportError as exc:  # pragma: no cover - exercised only when SDK absent
            raise RuntimeError(
                "The 'anthropic' package is required for AnthropicExplainerClient. "
                "Install it (see backend/requirements.txt) or use StubExplainerClient."
            ) from exc

        key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set.")

        self._anthropic = anthropic
        self._client = anthropic.Anthropic(api_key=key, timeout=5.0, max_retries=0)
        self._model = model
        self._max_tokens = max_tokens

    def explain(self, system: str, user: str) -> str:  # pragma: no cover - needs network
        try:
            resp = self._client.messages.create(
                model=self._model,
                max_tokens=self._max_tokens,
                temperature=0,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
        except self._anthropic.APIError as exc:
            raise ExplainerUnavailable("Live narration is unavailable.") from exc
        text = "".join(block.text for block in resp.content if block.type == "text").strip()
        if not text or resp.stop_reason in ("refusal", "max_tokens"):
            raise ExplainerUnavailable("The model did not return a complete narration.")
        return text

    @staticmethod
    def available() -> bool:
        """True when both the SDK and a key are present (i.e. a live call is possible)."""
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return False
        try:
            import anthropic  # noqa: F401
        except ImportError:
            return False
        return True

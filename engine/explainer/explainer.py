"""The explainer orchestration: insight object -> grounded explanation.

`Explainer.explain` is a pure function over its inputs (plus the injected client). It:
  1. projects the insight object into the grounded `facts` dict,
  2. builds the prompt and calls the client,
  3. runs the grounding guardrail over the returned text,
  4. returns both the text and the `GroundingReport`.

In `strict=True` mode (the production default) it raises `UngroundedExplanation` if the
model cites a number not present in the facts or leaks a forbidden term — the engine's
numbers are the source of truth, so an ungrounded explanation is a bug, not something to
show a user.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Sequence

from ..schemas.dedup import DedupResult
from ..schemas.transaction import UserProfile
from .client import ExplainerClient
from .facts import build_facts, collect_allowed_numbers
from .grounding import GroundingReport, verify_grounded
from .prompt import SYSTEM_PROMPT, build_user_prompt

# Default model for the explainer. Sonnet 5.5 is the sweet spot for this task:
# the explanation is short and the hard reasoning (the numbers) is already done by the
# engine, so Opus-level capability is not needed, while Haiku gives up some of the
# nuance in tone/uncertainty. Pin a cheaper fallback for high-volume batch explaining.
DEFAULT_MODEL = "claude-sonnet-5-5"
FALLBACK_MODEL = "claude-haiku-5-5"

# Vocabulary that must NEVER surface in a user-facing explanation. These are eval-only
# ground-truth labels (communal tags, transfer pair ids) that the engine does not even
# read; this is a belt-and-braces check that they cannot leak via the explainer.
FORBIDDEN_TERMS: Sequence[str] = (
    "transfer_pair_id",
    "communal_tag",
    "ajo",
    "esusu",
    "ajo_payout",
    "dependent",
    "informal_loan_out",
    "loan_repayment",
    "remittance_in",
)


class UngroundedExplanation(RuntimeError):
    """Raised in strict mode when an explanation fails the grounding guardrail."""

    def __init__(self, report: GroundingReport, text: str) -> None:
        super().__init__(f"Explanation failed grounding: {report.summary()}")
        self.report = report
        self.text = text


@dataclass
class ExplanationResult:
    text: str
    facts: Dict[str, Any]
    grounding: GroundingReport


class Explainer:
    def __init__(self, client: ExplainerClient, model: str = DEFAULT_MODEL) -> None:
        self.client = client
        self.model = model

    def explain(
        self, result: DedupResult, user: UserProfile, strict: bool = True
    ) -> ExplanationResult:
        facts = build_facts(result, user)
        user_prompt = build_user_prompt(facts)
        text = self.client.explain(SYSTEM_PROMPT, user_prompt).strip()

        allowed = collect_allowed_numbers(facts)
        report = verify_grounded(text, allowed, forbidden_terms=FORBIDDEN_TERMS)

        if strict and not report.ok:
            raise UngroundedExplanation(report, text)
        return ExplanationResult(text=text, facts=facts, grounding=report)

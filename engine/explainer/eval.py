"""Eval harness for the GenAI explainer.

Golden `insight -> explanation` cases plus the grounding property checks that every
explanation must satisfy. Runs fully offline against the deterministic `StubExplainerClient`
(no API key, no network) so it can gate CI; if `ANTHROPIC_API_KEY` and the `anthropic`
SDK are present it ALSO runs the same golden cases through the live model and applies the
same grounding guardrail, reporting (but not failing CI on) the result.

What the harness asserts for each golden case:
  * the explanation is grounded — every number it cites is traceable to the insight
    object (this is enforced by `Explainer` in strict mode);
  * the headline figures that MUST be communicated actually appear;
  * no eval-only ground-truth vocabulary leaks.

Plus two "teeth" checks that prove the verifier catches real failures: a hand-written
explanation with a fabricated figure is rejected, and one that leaks a forbidden term is
rejected.

Run it:  ../.venv/bin/python -m app.explainer.eval       (from backend/)
or via:  ../.venv/bin/python -m pytest tests/test_explainer.py -q
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

from ..schemas.dedup import DedupResult, MatchedTransfer, Totals
from ..schemas.transaction import Transaction, UserProfile
from .client import AnthropicExplainerClient, ExplainerClient, StubExplainerClient
from .explainer import DEFAULT_MODEL, Explainer, UngroundedExplanation
from .facts import build_facts, collect_allowed_numbers
from .grounding import extract_numbers, verify_grounded

_TOL = 0.01


def _txn(
    tid: str,
    account_id: str,
    institution: str,
    amount: float,
    direction: str,
    when: str,
) -> Transaction:
    return Transaction(
        id=tid,
        account_id=account_id,
        institution=institution,
        amount=amount,
        direction=direction,  # type: ignore[arg-type]
        timestamp=datetime.fromisoformat(when),
        narration="STEPHEN VINCENT TRANSFER",
    )


def _match(
    amount: float, fee: float, score: float, tier: str, from_bank: str, to_bank: str, when: str
) -> MatchedTransfer:
    reasons = ["Moves between two different banks", "Counterparty matches the account holder's own name"]
    if fee > 0:
        reasons.append("Amount matches net of ~{:,.0f} fee".format(fee))
    return MatchedTransfer(
        debit=_txn(f"d-{from_bank}-{amount:.0f}", "acct-1", from_bank, amount + fee, "debit", when),
        credit=_txn(f"c-{to_bank}-{amount:.0f}", "acct-2", to_bank, amount, "credit", when),
        score=score,
        tier=tier,  # type: ignore[arg-type]
        fee=fee,
        reasons=reasons,
    )


@dataclass
class GoldenCase:
    name: str
    description: str
    result: DedupResult
    user: UserProfile
    must_mention: List[float]
    expect_no_transfers_language: bool = False


def golden_cases() -> List[GoldenCase]:
    stephen = UserProfile(
        user_id="u-stephen",
        full_name="Stephen Vincent",
        aliases=["Vincent Stephen"],
        account_ids=["acct-1", "acct-2"],
    )

    # --- Case 1: a strong dedup result (the headline scenario). ---
    strong = DedupResult(
        matches=[
            _match(500000, 50, 0.98, "high", "gtbank", "kuda", "2025-06-01T10:00:00"),
            _match(450000, 25, 0.91, "high", "access", "gtbank", "2025-06-12T14:30:00"),
            _match(300000, 10, 0.72, "medium", "kuda", "access", "2025-06-20T09:15:00"),
        ],
        totals=Totals(
            gross_income=3_250_000,
            gross_spending=3_250_085,
            transfer_volume=1_250_042.5,
            net_income=2_000_000,
            net_spending=2_000_000,
            income_inflation_pct=62.5,
            spending_inflation_pct=62.5,
        ),
        unmatched_transfer_candidates=[],
    )

    # --- Case 2: nothing to dedup (clean account). ---
    clean = DedupResult(
        matches=[],
        totals=Totals(
            gross_income=900_000,
            gross_spending=612_500,
            transfer_volume=0.0,
            net_income=900_000,
            net_spending=612_500,
            income_inflation_pct=0.0,
            spending_inflation_pct=0.0,
        ),
        unmatched_transfer_candidates=[],
    )

    return [
        GoldenCase(
            name="strong_dedup_three_transfers",
            description="Three self-transfers found; income overstated by 62.5%.",
            result=strong,
            user=stephen,
            must_mention=[3, 2_000_000, 62.5, 1_250_042.5],
        ),
        GoldenCase(
            name="zero_matches_clean_account",
            description="No self-transfers; figures already reflect real money.",
            result=clean,
            user=stephen,
            must_mention=[900_000, 612_500],
            expect_no_transfers_language=True,
        ),
    ]


@dataclass
class CaseOutcome:
    name: str
    passed: bool
    text: str
    detail: str = ""


@dataclass
class EvalReport:
    outcomes: List[CaseOutcome] = field(default_factory=list)
    live_outcomes: List[CaseOutcome] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(o.passed for o in self.outcomes)

    def render(self) -> str:
        lines = ["=== Explainer eval (offline / StubExplainerClient) ==="]
        for o in self.outcomes:
            flag = "PASS" if o.passed else "FAIL"
            lines.append(f"[{flag}] {o.name}")
            if o.text:
                lines.append(f'        -> "{o.text}"')
            if o.detail:
                lines.append(f"        {o.detail}")
        lines.append("")
        lines.append(f"{'ALL PASSED' if self.passed else 'FAILURES PRESENT'} "
                     f"({sum(o.passed for o in self.outcomes)}/{len(self.outcomes)} offline cases)")
        if self.live_outcomes:
            lines.append("")
            lines.append(f"=== Live model ({DEFAULT_MODEL}) — informational, not gating ===")
            for o in self.live_outcomes:
                flag = "grounded" if o.passed else "UNGROUNDED"
                lines.append(f"[{flag}] {o.name}")
                if o.text:
                    lines.append(f'        -> "{o.text}"')
                if o.detail:
                    lines.append(f"        {o.detail}")
        return "\n".join(lines)


def _mentions(text: str, wanted: float) -> bool:
    return any(abs(n - wanted) <= _TOL for n in extract_numbers(text))


def _run_cases(client: ExplainerClient, strict: bool) -> List[CaseOutcome]:
    explainer = Explainer(client)
    outcomes: List[CaseOutcome] = []
    for case in golden_cases():
        try:
            res = explainer.explain(case.result, case.user, strict=strict)
        except UngroundedExplanation as exc:
            outcomes.append(CaseOutcome(case.name, False, exc.text, f"grounding: {exc.report.summary()}"))
            continue

        problems: List[str] = []
        if not res.grounding.ok:
            problems.append(f"grounding: {res.grounding.summary()}")
        for n in case.must_mention:
            if not _mentions(res.text, n):
                problems.append(f"missing required figure {n}")
        if case.expect_no_transfers_language and not any(
            kw in res.text.lower() for kw in ("no ", "none", "already reflect")
        ):
            problems.append("expected 'no self-transfers' language")

        outcomes.append(
            CaseOutcome(case.name, not problems, res.text, "; ".join(problems))
        )
    return outcomes


def _teeth_checks() -> List[CaseOutcome]:
    """Prove the verifier rejects real failures, not just rubber-stamps the stub."""
    case = golden_cases()[0]
    facts = build_facts(case.result, case.user)
    allowed = collect_allowed_numbers(facts)
    from .explainer import FORBIDDEN_TERMS

    outcomes: List[CaseOutcome] = []

    # (a) A fabricated figure must be flagged.
    hallucinated = "Your real income is ₦2,000,000 — but you also secretly earned ₦9,999,999."
    rep_a = verify_grounded(hallucinated, allowed, forbidden_terms=FORBIDDEN_TERMS)
    passed_a = (not rep_a.ok) and (9999999.0 in rep_a.ungrounded_numbers)
    outcomes.append(
        CaseOutcome("verifier_rejects_fabricated_number", passed_a, hallucinated, rep_a.summary())
    )

    # (b) A leaked ground-truth label must be flagged.
    leaked = "Your real income is ₦2,000,000. We tagged one transfer as ajo savings."
    rep_b = verify_grounded(leaked, allowed, forbidden_terms=FORBIDDEN_TERMS)
    passed_b = (not rep_b.ok) and bool(rep_b.forbidden_hits)
    outcomes.append(
        CaseOutcome("verifier_rejects_leaked_label", passed_b, leaked, rep_b.summary())
    )

    # (c) A clean, fully-grounded sentence must pass.
    clean = "You moved ₦1,250,042.50 between your own banks, so your real income is ₦2,000,000."
    rep_c = verify_grounded(clean, allowed, forbidden_terms=FORBIDDEN_TERMS)
    outcomes.append(
        CaseOutcome("verifier_accepts_grounded_text", rep_c.ok, clean, rep_c.summary())
    )
    return outcomes


def run_eval(include_live: Optional[bool] = None) -> EvalReport:
    """Run the offline golden cases + teeth checks. Optionally also hit the live model."""
    report = EvalReport()
    report.outcomes.extend(_run_cases(StubExplainerClient(), strict=True))
    report.outcomes.extend(_teeth_checks())

    want_live = AnthropicExplainerClient.available() if include_live is None else include_live
    if want_live and AnthropicExplainerClient.available():
        report.live_outcomes.extend(
            _run_cases(AnthropicExplainerClient(model=DEFAULT_MODEL), strict=False)
        )
    return report


def main() -> int:
    report = run_eval()
    print(report.render())
    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""Pytest entry point for the explainer eval harness.

Keeps the harness logic in `engine.explainer.eval` (so it is also runnable as a script and
reusable against the live model) and asserts the offline suite passes here.
"""

from __future__ import annotations

import pytest

from engine.explainer import (
    Explainer,
    StubExplainerClient,
    UngroundedExplanation,
    build_facts,
    collect_allowed_numbers,
    verify_grounded,
)
from engine.explainer.eval import golden_cases, run_eval


def test_offline_eval_suite_passes():
    report = run_eval(include_live=False)
    assert report.passed, "\n" + report.render()


@pytest.mark.parametrize("case", golden_cases(), ids=lambda c: c.name)
def test_each_golden_case_is_grounded(case):
    res = Explainer(StubExplainerClient()).explain(case.result, case.user, strict=True)
    assert res.grounding.ok, res.grounding.summary()
    for figure in case.must_mention:
        assert any(abs(n - figure) <= 0.01 for n in _nums(res.text)), (
            f"expected figure {figure} in explanation: {res.text!r}"
        )


def test_strict_mode_raises_on_ungrounded_number():
    """A client that invents a number must trip the strict guardrail."""
    case = golden_cases()[0]

    class LyingClient:
        def explain(self, system: str, user: str) -> str:
            return "Your real income is actually ₦42,424,242."

    with pytest.raises(UngroundedExplanation):
        Explainer(LyingClient()).explain(case.result, case.user, strict=True)


def test_eval_only_fields_never_enter_facts():
    """transfer_pair_id / communal_tag must not appear anywhere in the facts payload."""
    case = golden_cases()[0]
    facts = build_facts(case.result, case.user)
    blob = repr(facts).lower()
    assert "transfer_pair_id" not in blob
    assert "communal_tag" not in blob


def test_largest_move_uses_settled_value_in_a_common_currency():
    case = golden_cases()[0]
    fx = case.result.matches[-1]
    fx.credit = fx.credit.model_copy(update={"currency": "USD", "amount": 600.0})
    # A custom engine rate: the explainer must use the supplied value.
    fx.credit_amount_ngn = 900_000.0
    res = Explainer(StubExplainerClient()).explain(case.result, case.user)
    assert "The largest move, ₦900,000 from kuda to access" in res.text

    # A match read from older data without an FX conversion cannot be compared
    # against the NGN matches or relabelled as naira.
    fx.credit_amount_ngn = None
    case.result.matches.reverse()
    res = Explainer(StubExplainerClient()).explain(case.result, case.user)
    assert "One move, USD 600 from kuda to access" in res.text
    assert "largest" not in res.text


def test_transfer_only_income_has_no_inflation_percentage():
    case = golden_cases()[0]
    case.result.totals.net_income = 0
    case.result.totals.gross_income = case.result.totals.transfer_volume
    res = Explainer(StubExplainerClient()).explain(case.result, case.user)
    assert res.facts["totals"]["income_inflation_pct"] is None
    assert "real income is ₦0" in res.text
    assert "inflated your income by" not in res.text


def test_verifier_has_teeth():
    case = golden_cases()[0]
    allowed = collect_allowed_numbers(build_facts(case.result, case.user))
    bad = verify_grounded("You earned ₦9,999,999.", allowed)
    assert not bad.ok and 9999999.0 in bad.ungrounded_numbers


def _nums(text):
    from engine.explainer.grounding import extract_numbers

    return extract_numbers(text)

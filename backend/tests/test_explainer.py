"""Pytest entry point for the explainer eval harness.

Keeps the harness logic in `app.explainer.eval` (so it is also runnable as a script and
reusable against the live model) and asserts the offline suite passes here.
"""

from __future__ import annotations

import pytest

from app.explainer import (
    Explainer,
    StubExplainerClient,
    UngroundedExplanation,
    build_facts,
    collect_allowed_numbers,
    verify_grounded,
)
from app.explainer.eval import golden_cases, run_eval


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


def test_verifier_has_teeth():
    case = golden_cases()[0]
    allowed = collect_allowed_numbers(build_facts(case.result, case.user))
    bad = verify_grounded("You earned ₦9,999,999.", allowed)
    assert not bad.ok and 9999999.0 in bad.ungrounded_numbers


def _nums(text):
    from app.explainer.grounding import extract_numbers

    return extract_numbers(text)

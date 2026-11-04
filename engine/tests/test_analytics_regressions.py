"""Boundary and chronology regressions found outside the labelled demo set."""

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from engine.communal.classifier import CommunalClassifier
from engine.schemas.transaction import Transaction, UserProfile


def _transaction(**updates):
    values = dict(
        id="loan", account_id="account", institution="bank", amount=20_000,
        direction="debit", timestamp=datetime(2026, 6, 2, tzinfo=timezone.utc),
        narration="Loan to Test Contact", counterparty_name="Test Contact",
    )
    values.update(updates)
    return Transaction(**values)


@pytest.mark.parametrize("field", ["amount", "balance"])
@pytest.mark.parametrize("value", [float("inf"), float("-inf"), float("nan")])
def test_transaction_money_must_be_finite(field, value):
    with pytest.raises(ValidationError):
        _transaction(**{field: value})


@pytest.mark.parametrize("days,expected", [(-1, None), (1, "loan_repayment")])
def test_loan_repayment_requires_an_earlier_outflow(days, expected):
    loan = _transaction()
    incoming = _transaction(
        id="incoming", direction="credit", narration="Loan repayment from Test Contact",
        timestamp=loan.timestamp + timedelta(days=days),
    )
    # Input order is deliberately unrelated to chronological order.
    result = CommunalClassifier().classify(
        [incoming, loan], UserProfile(user_id="user", full_name="Account Holder"),
    )
    assert result.tag_by_id().get(incoming.id) == expected

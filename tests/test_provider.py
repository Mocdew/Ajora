"""Spine tests for the canonical schema, adapters, and MockProvider.

Two guarantees are asserted:

1. ``MockProvider().get_transactions("persona_1")`` returns a non-empty
   ``list[Transaction]`` of valid canonical objects, spanning >= 2 institutions
   (so the cross-institution self-transfer the dedup stage looks for is present).
2. The adapters round-trip: a Mono-shaped payload and an Okra-shaped payload that
   describe the *same* economic transaction normalize into equivalent canonical
   fields — proving the normalization layer reconciles divergent wire formats.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from data.adapters import mono_to_transaction, okra_to_transaction
from data.provider import MockProvider
from engine.models import Transaction, TransactionDirection


# --------------------------------------------------------------------------- 1.
def test_mock_provider_persona_1_returns_valid_transactions() -> None:
    txns = MockProvider().get_transactions("persona_1")

    assert isinstance(txns, list)
    assert txns, "persona_1 should yield at least one transaction"
    assert all(isinstance(t, Transaction) for t in txns)

    # Every amount is a positive Decimal (never float) with an explicit direction.
    for t in txns:
        assert isinstance(t.amount, Decimal)
        assert t.amount > 0
        assert isinstance(t.direction, TransactionDirection)
        assert t.timestamp.tzinfo is not None  # timezone-aware, normalized to UTC

    # The cross-institution self-transfer requires >= 2 institutions in the feed.
    institutions = {t.institution for t in txns}
    assert len(institutions) >= 2, f"expected multiple institutions, got {institutions}"

    # The obvious self-transfer: a debit and a credit sharing a reference, at two banks.
    legs = [t for t in txns if t.reference == "100033445566"]
    assert len(legs) == 2
    by_dir = {t.direction: t for t in legs}
    assert set(by_dir) == {TransactionDirection.DEBIT, TransactionDirection.CREDIT}
    assert by_dir[TransactionDirection.DEBIT].institution != by_dir[TransactionDirection.CREDIT].institution
    assert by_dir[TransactionDirection.DEBIT].amount == by_dir[TransactionDirection.CREDIT].amount


def test_mock_provider_persona_2_uses_the_other_shape() -> None:
    # persona_2 exercises the Okra adapter (signed amounts, epoch-ms dates).
    txns = MockProvider().get_transactions("persona_2")
    assert txns and all(isinstance(t, Transaction) for t in txns)
    assert all(t.raw.get("provider") == "okra" for t in txns)
    # Signed-amount decoding yields both directions from the one 'amount' field.
    assert {t.direction for t in txns} == {TransactionDirection.DEBIT, TransactionDirection.CREDIT}


def test_ground_truth_labels_load_but_stay_out_of_serialization() -> None:
    """The labelled mock dataset carries eval-only ground truth that normalizes
    onto the model yet never leaks into its serialized/engine-visible form."""
    # persona_1: both legs of the self-transfer share one transfer_pair_id.
    p1 = MockProvider().get_transactions("persona_1")
    pair_legs = [t for t in p1 if t.transfer_pair_id is not None]
    assert len(pair_legs) == 2
    assert {t.transfer_pair_id for t in pair_legs} == {"p1_self_1"}
    # Non-transfer rows carry no label.
    assert any(t.transfer_pair_id is None for t in p1)

    # persona_2: the communal outflows are tagged ajo / dependent.
    p2 = MockProvider().get_transactions("persona_2")
    tags = {t.communal_tag for t in p2 if t.communal_tag is not None}
    assert tags == {"ajo", "dependent"}

    # exclude=True keeps ground truth out of model_dump(), so the engine/API path
    # that serializes transactions can't accidentally "see" the answers.
    dumped = pair_legs[0].model_dump()
    assert "transfer_pair_id" not in dumped
    assert "communal_tag" not in dumped


# --------------------------------------------------------------------------- 2.
def test_adapters_roundtrip_to_equivalent_canonical_fields() -> None:
    """Same real-world transaction, two divergent wire shapes -> equal canonical fields."""
    instant = datetime(2026, 10, 1, 9, 15, 0, tzinfo=timezone.utc)
    epoch_ms = int(instant.timestamp() * 1000)

    # Mono shape: kobo minor units, explicit 'type', ISO-8601 'date'.
    mono_raw = {
        "_id": "mono_x",
        "account": "gtb-001",
        "institution": "gtbank",
        "type": "debit",
        "amount": 15000000,  # kobo -> 150,000.00
        "narration": "TRF/STEPHEN VINCENT/to self",
        "date": "2026-10-01T09:15:00.000Z",
        "balance": 30000000,  # kobo -> 300,000.00
        "reference": "REF-1",
    }

    # Okra shape: SIGNED naira major units, epoch-ms 'trans_date', different field names.
    okra_raw = {
        "id": "okra_x",
        "account_id": "gtb-001",
        "bank": "gtbank",
        "amount": -150000.00,  # negative -> debit, magnitude 150,000.00
        "notes": "TRF/STEPHEN VINCENT/to self",
        "trans_date": epoch_ms,
        "balance": 300000.00,
        "ref": "REF-1",
    }

    m = mono_to_transaction(mono_raw)
    o = okra_to_transaction(okra_raw)

    # The two wire shapes reconcile to identical canonical values:
    assert m.amount == o.amount == Decimal("150000.00")
    assert m.balance_after == o.balance_after == Decimal("300000.00")
    assert m.direction == o.direction == TransactionDirection.DEBIT
    assert m.timestamp == o.timestamp == instant
    assert m.currency == o.currency == "NGN"
    assert m.institution == o.institution == "gtbank"
    assert m.narration == o.narration
    assert m.reference == o.reference == "REF-1"

    # Amounts are real Decimals, not floats — no binary drift smuggled in.
    assert isinstance(m.amount, Decimal) and isinstance(o.amount, Decimal)

    # A real provider payload has no ground-truth labels; the live path is clean.
    assert m.transfer_pair_id is None and m.communal_tag is None
    assert o.transfer_pair_id is None and o.communal_tag is None


def test_transaction_is_immutable() -> None:
    t = MockProvider().get_transactions("persona_1")[0]
    import pytest

    with pytest.raises(Exception):
        t.amount = Decimal("1")  # frozen model: assignment must fail

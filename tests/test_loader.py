"""Phase 2 harness: load any persona in one call, then shape it for candidate-match.

Guarantees asserted here:

1. ``load_persona(id)`` returns a plain ``list[Transaction]`` for *every* persona in
   the mock dataset — the engine's test harness loads any persona in one call, with
   no knowledge of providers or files.
2. The pure grouping/windowing helpers split a user's transactions by account and by
   time window, and surface the cross-account far leg of a self-transfer — exactly
   what the engine's candidate-match stage consumes.
"""

from __future__ import annotations

from datetime import timedelta

from data.loader import available_personas, load_persona
from engine.grouping import (
    cross_account_candidates,
    group_by_account,
    group_by_institution,
    in_window,
    window_around,
)
from engine.models import Transaction, TransactionDirection


# --------------------------------------------------------------------------- 1.
def test_load_any_persona_by_id_in_one_call() -> None:
    personas = available_personas()
    assert personas, "the mock dataset should contain at least one persona"

    for persona_id in personas:
        txns = load_persona(persona_id)
        assert isinstance(txns, list) and txns
        assert all(isinstance(t, Transaction) for t in txns)


def test_loader_returns_plain_models_not_a_provider() -> None:
    # The engine receives plain Transaction lists — never a provider object.
    txns = load_persona("persona_1")
    assert isinstance(txns, list)
    assert all(isinstance(t, Transaction) for t in txns)


# --------------------------------------------------------------------------- 2.
def test_group_by_account_and_institution() -> None:
    txns = load_persona("persona_1")

    by_account = group_by_account(txns)
    assert set(by_account) == {"gtb-001", "kuda-003"}
    assert sum(len(v) for v in by_account.values()) == len(txns)

    by_institution = group_by_institution(txns)
    assert set(by_institution) == {"gtbank", "kuda"}


def test_window_slicing_bounds_the_search() -> None:
    txns = load_persona("persona_1")
    # The two self-transfer legs settle ~2 minutes apart; a 10-minute window around
    # the debit leg must catch both legs and exclude the unrelated later rows.
    debit_leg = next(
        t for t in txns
        if t.reference == "100033445566" and t.direction is TransactionDirection.DEBIT
    )
    near = window_around(txns, debit_leg.timestamp, timedelta(minutes=10))
    assert {t.reference for t in near} == {"100033445566"}
    assert len(near) == 2

    # in_window is the closed-interval primitive window_around is built on.
    only_debit = in_window(txns, debit_leg.timestamp, debit_leg.timestamp)
    assert only_debit == [debit_leg]


def test_cross_account_candidates_surface_the_far_leg() -> None:
    txns = load_persona("persona_1")
    debit_leg = next(
        t for t in txns
        if t.reference == "100033445566" and t.direction is TransactionDirection.DEBIT
    )

    candidates = cross_account_candidates(source=debit_leg, transactions=txns, window=timedelta(minutes=10))

    # Exactly the matching credit leg: opposite direction, different account & bank.
    assert len(candidates) == 1
    far = candidates[0]
    assert far.direction is TransactionDirection.CREDIT
    assert far.account_id != debit_leg.account_id
    assert far.institution != debit_leg.institution
    assert far.reference == debit_leg.reference
    # ...and it is genuinely the labelled pair (ground truth; asserted in the harness,
    # never read by the engine itself).
    assert far.transfer_pair_id == debit_leg.transfer_pair_id == "p1_self_1"

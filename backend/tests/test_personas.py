"""Structural + label-integrity tests for the generated persona fixtures.

These make the dataset's "done" criteria machine-checked: every `persona_*.json` must
validate against the schema, every self-transfer must be a well-formed 2-leg pair across
two accounts, every communal tag must be in the allowed vocabulary (and all required
tags present), and genuine unlabelled transactions must exist so precision is meaningful.
"""

from __future__ import annotations

from collections import defaultdict

import pytest

from app.datasets import load_all_personas, persona_paths
from app.dedup.engine import DedupEngine
from app.dedup.evaluation import evaluate

# Controlled vocabulary for the communal-finance classification stage.
ALLOWED_COMMUNAL_TAGS = {
    "ajo",
    "ajo_payout",
    "dependent",
    "informal_loan_out",
    "loan_repayment",
    "remittance_in",
}
# Every one of these must appear at least once across the whole dataset.
REQUIRED_COMMUNAL_TAGS = set(ALLOWED_COMMUNAL_TAGS)


def test_persona_files_exist():
    paths = persona_paths()
    assert len(paths) == 3, f"expected 3 persona files, found {[p.name for p in paths]}"


def test_all_personas_validate_against_schema():
    # load_all_personas parses each file into a validated TransactionBatch; a schema
    # violation would raise here.
    batches = load_all_personas()
    assert len(batches) == 3
    for batch in batches:
        assert batch.transactions, "a persona batch has no transactions"
        # account ids referenced by transactions must be declared on the profile
        declared = set(batch.user.account_ids)
        used = {t.account_id for t in batch.transactions}
        assert used <= declared, f"{batch.user.user_id}: undeclared accounts {used - declared}"


def test_transfer_pairs_are_wellformed():
    """Each transfer_pair_id groups exactly two legs: one debit and one credit, on two
    different accounts (a cross-account self-transfer)."""
    for batch in load_all_personas():
        groups: dict[str, list] = defaultdict(list)
        for t in batch.transactions:
            if t.transfer_pair_id:
                groups[t.transfer_pair_id].append(t)
        assert groups, f"{batch.user.user_id}: no labelled self-transfers found"
        for pid, legs in groups.items():
            assert len(legs) == 2, f"{pid}: expected 2 legs, got {len(legs)}"
            directions = sorted(leg.direction for leg in legs)
            assert directions == ["credit", "debit"], f"{pid}: legs are {directions}"
            accounts = {leg.account_id for leg in legs}
            assert len(accounts) == 2, f"{pid}: both legs on the same account {accounts}"


def test_communal_tags_are_in_vocabulary_and_complete():
    seen: set[str] = set()
    for batch in load_all_personas():
        for t in batch.transactions:
            if t.communal_tag is not None:
                assert (
                    t.communal_tag in ALLOWED_COMMUNAL_TAGS
                ), f"{t.id}: unknown communal_tag {t.communal_tag!r}"
                seen.add(t.communal_tag)
    missing = REQUIRED_COMMUNAL_TAGS - seen
    assert not missing, f"required communal tags never appear: {sorted(missing)}"


def test_communal_legs_are_not_also_self_transfers():
    """A communal transfer is never a self-transfer leg, and vice versa."""
    for batch in load_all_personas():
        for t in batch.transactions:
            assert not (
                t.communal_tag and t.transfer_pair_id
            ), f"{t.id}: carries both a communal_tag and a transfer_pair_id"


def test_unlabelled_genuine_transactions_exist():
    """Precision is only meaningful if genuine (unlabelled) income/expense exist."""
    for batch in load_all_personas():
        unlabelled = [
            t
            for t in batch.transactions
            if t.transfer_pair_id is None and t.communal_tag is None
        ]
        assert len(unlabelled) >= 10, (
            f"{batch.user.user_id}: only {len(unlabelled)} unlabelled txns"
        )


def test_required_patterns_present_somewhere():
    """At least one ajo_payout, one loan_repayment and one cross-currency (USD) leg
    exist — the trickier patterns the generator must carry."""
    tags = set()
    has_usd = False
    for batch in load_all_personas():
        for t in batch.transactions:
            if t.communal_tag:
                tags.add(t.communal_tag)
            if t.currency != "NGN":
                has_usd = True
    assert "ajo_payout" in tags
    assert "loan_repayment" in tags
    assert has_usd, "expected at least one non-NGN (USD domiciliary) transaction"


@pytest.mark.parametrize("batch", load_all_personas(), ids=lambda b: b.user.user_id)
def test_dedup_precision_is_perfect_per_persona(batch):
    """No genuine transaction (hard negatives included) may be matched as a phantom
    self-transfer: precision must be 1.0 on every persona."""
    result = DedupEngine().dedup(batch.transactions, batch.user)
    metrics = evaluate(result, batch)
    assert metrics.precision == 1.0, metrics.as_dict()

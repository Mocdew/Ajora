"""Tests for the relationship-level insight layer (stage-2 structured output).

These assert the insight builder's contract: the four relationship types are detected
on the labelled personas (and nothing spurious), informal-lending net balance is
correct, `pct_of_net_income` is measured against the dedup net income, insights are
built strictly from the deduped ledger (no self-transfer leg can appear), and the
builder never reads the eval-only ground-truth labels.
"""

from __future__ import annotations

from typing import Dict, List

from engine.communal.evaluation import evaluate_insights, gold_relationships
from engine.communal.insights import TAG_TO_TYPE, build_insights
from engine.dedup.engine import DedupEngine
from engine.schemas.transaction import TransactionBatch


def _pipeline(batch: TransactionBatch):
    """dedup first, then insights on the deduped output — the production order."""
    dres = DedupEngine().dedup(batch.transactions, batch.user)
    return dres, build_insights(dres, batch.user)


# --- the four relationship types are detected on the personas -----------------------

def test_four_types_detected_across_personas(persona_batches):
    seen = set()
    for batch in persona_batches.values():
        _dres, insights = _pipeline(batch)
        m = evaluate_insights(insights, batch)
        assert m.exact, (batch.user.full_name, m.false_positives, m.false_negatives)
        seen.update(insights.types_detected())
    assert seen == {"ajo_esusu", "dependent", "informal_lending", "remittance"}


def test_persona_relationships_mapped_exactly(persona_batches):
    """Each persona's detected (counterparty, type) set equals the gold set."""
    expected: Dict[str, set] = {
        "persona_a": set(),
        "persona_b": {("CHIOMA BALOGUN", "remittance"), ("MAMA EMEKA", "dependent")},
        "persona_c": {
            ("IYABO ADISA", "ajo_esusu"),
            ("TUNDE ADEYEMI", "dependent"),
            ("CHIDI OKEKE", "informal_lending"),
        },
    }
    for name, batch in persona_batches.items():
        _dres, insights = _pipeline(batch)
        detected = {(i.counterparty, i.relationship_type) for i in insights.insights}
        assert detected == expected[name], (name, detected)
        # gold derived from communal_tag agrees with our hand-written expectation
        assert gold_relationships(batch) == expected[name]


# --- informal-lending net balance ---------------------------------------------------

def test_informal_lending_net_balance(persona_batches):
    """Persona C: CHIDI OKEKE lent 50,000, repaid 20,000 -> 30,000 still owed."""
    _dres, insights = _pipeline(persona_batches["persona_c"])
    chidi = next(i for i in insights.insights if i.counterparty == "CHIDI OKEKE")
    assert chidi.relationship_type == "informal_lending"
    assert chidi.total_out_ngn == 50000.0
    assert chidi.total_in_ngn == 20000.0
    assert chidi.net_position_ngn == 30000.0  # positive => counterparty owes the user
    assert set(chidi.tags) == {"informal_loan_out", "loan_repayment"}
    assert sorted(chidi.member_transaction_ids) == ["t078", "t079"]


# --- pct_of_net_income is computed against the dedup net income ----------------------

def test_pct_of_net_income_uses_dedup_net_income(persona_batches):
    dres, insights = _pipeline(persona_batches["persona_c"])
    net_income = dres.totals.net_income
    assert insights.net_income_ngn == net_income

    tunde = next(i for i in insights.insights if i.counterparty == "TUNDE ADEYEMI")
    # dependent numerator = outflow (120,000)
    assert tunde.total_out_ngn == 120000.0
    assert tunde.pct_of_net_income == round(100.0 * 120000.0 / net_income, 2)

    chidi = next(i for i in insights.insights if i.counterparty == "CHIDI OKEKE")
    # informal_lending numerator = net position (outstanding exposure)
    assert chidi.pct_of_net_income == round(100.0 * 30000.0 / net_income, 2)


def test_remittance_pct_uses_inflow(persona_batches):
    dres, insights = _pipeline(persona_batches["persona_b"])
    chioma = next(i for i in insights.insights if i.counterparty == "CHIOMA BALOGUN")
    assert chioma.relationship_type == "remittance"
    # 3 inflows, USD -> NGN normalized; numerator = inflow volume
    assert chioma.total_in_ngn > 0 and chioma.total_out_ngn == 0.0
    assert chioma.pct_of_net_income == round(
        100.0 * chioma.total_in_ngn / dres.totals.net_income, 2
    )


# --- insights are built from the DEDUPED ledger -------------------------------------

def test_no_self_transfer_leg_appears_in_any_insight(persona_batches):
    """Persona C has self-transfer legs (st080..st083); none may land in an insight."""
    dres, insights = _pipeline(persona_batches["persona_c"])
    internal = set(dres.internal_transfer_ids)
    assert internal  # sanity: this persona really does have deduped self-transfers
    member_ids = {
        tid for ins in insights.insights for tid in ins.member_transaction_ids
    }
    assert member_ids.isdisjoint(internal)


# --- the insight builder never reads eval-only ground-truth labels ------------------

def test_insights_ignore_eval_labels(persona_batches):
    batch = persona_batches["persona_c"]
    _dres, baseline = _pipeline(batch)

    # scramble BOTH eval-only fields to wrong values; the whole pipeline (dedup +
    # insights) must produce byte-identical insights.
    scrambled_txns = [
        t.model_copy(update={"communal_tag": "dependent", "transfer_pair_id": "SCRAMBLED"})
        for t in batch.transactions
    ]
    scrambled_batch = TransactionBatch(user=batch.user, transactions=scrambled_txns)
    _dres2, after = _pipeline(scrambled_batch)

    assert baseline.model_dump(mode="json") == after.model_dump(mode="json")


# --- tag -> relationship-type map is total over the six tags ------------------------

def test_tag_to_type_covers_all_six_tags():
    assert set(TAG_TO_TYPE) == {
        "ajo", "ajo_payout", "dependent",
        "informal_loan_out", "loan_repayment", "remittance_in",
    }
    assert set(TAG_TO_TYPE.values()) == {
        "ajo_esusu", "dependent", "informal_lending", "remittance",
    }

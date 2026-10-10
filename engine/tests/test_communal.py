"""Tests for the communal-finance classification stage."""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List

from engine.communal.classifier import CommunalClassifier
from engine.communal.evaluation import evaluate
from engine.communal.graph import build_relationship_graph
from engine.communal.lexicon import cue_hits, is_merchant_or_bill
from engine.dedup.engine import DedupEngine
from engine.schemas.transaction import Transaction, TransactionBatch, UserProfile


def _run(batch: TransactionBatch):
    """Full stage-1 -> stage-2 pipeline, as production would call it."""
    dres = DedupEngine().dedup(batch.transactions, batch.user)
    return CommunalClassifier().classify(
        batch.transactions, batch.user, skip_ids=set(dres.internal_transfer_ids)
    )


def _txn(**kw) -> Transaction:
    base = dict(
        id="x", account_id="a", institution="gtbank", amount=20000.0,
        direction="debit", timestamp=datetime(2026, 6, 1, 12, 0), narration="",
    )
    base.update(kw)
    return Transaction(**base)


# --- end-to-end accuracy on the labelled set ----------------------------------------

def test_perfect_micro_f1_on_labelled_personas(persona_batches):
    tp = fp = fn = 0
    for batch in persona_batches.values():
        m = evaluate(_run(batch), batch).micro
        tp += m.tp
        fp += m.fp
        fn += m.fn
    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    assert precision == 1.0 and recall == 1.0
    assert tp == 19  # all labelled communal transactions across the personas


def test_every_tag_is_exercised_and_correct(persona_batches):
    seen = set()
    for batch in persona_batches.values():
        metrics = evaluate(_run(batch), batch)
        for tag, m in metrics.per_class.items():
            seen.add(tag)
            assert m.fp == 0 and m.fn == 0, (tag, m)
    assert seen == {
        "ajo", "ajo_payout", "dependent", "informal_loan_out",
        "loan_repayment", "remittance_in",
    }


# --- precision regression guards ----------------------------------------------------

def test_merchant_payout_not_classified(persona_batches):
    """PSP settlements ("FLUTTERWAVE MERCHANT PAYOUT") must not become ajo_payout."""
    batch = persona_batches["persona_b"]
    pred = _run(batch).tag_by_id()
    for t in batch.transactions:
        if "FLUTTERWAVE" in t.narration.upper() or "MERCHANT" in t.narration.upper():
            assert t.id not in pred, (t.id, t.narration)


def test_recurring_business_transfer_is_not_dependent(persona_batches):
    """A monthly rent transfer to a 'PROPERTIES' company recurs like support but isn't."""
    batch = persona_batches["persona_a"]
    pred = _run(batch).tag_by_id()
    for t in batch.transactions:
        if "RENT" in t.narration.upper() or "PROPERTIES" in t.narration.upper():
            assert t.id not in pred


def test_ajo_payout_requires_reciprocity_not_just_a_cue():
    user = UserProfile(user_id="u", full_name="Bola Ade")
    # A credit that says "AJO PAYOUT" but from someone we never contribute to -> not ajo_payout.
    stranger = _txn(
        id="s1", direction="credit", amount=80000,
        narration="TRF FROM MR STRANGER AJO PAYOUT", counterparty_name="MR STRANGER",
    )
    res = CommunalClassifier().classify([stranger], user)
    assert stranger.id not in res.tag_by_id()


def test_ajo_payout_fires_when_we_contribute_to_that_group():
    user = UserProfile(user_id="u", full_name="Bola Ade")
    txns: List[Transaction] = [
        _txn(id=f"c{i}", direction="debit", amount=20000,
             timestamp=datetime(2026, m, 5, 12, 0),
             narration="TRF TO IYABO AJO CONTRIBUTION", counterparty_name="IYABO")
        for i, m in enumerate((5, 6, 7), start=1)
    ]
    payout = _txn(id="p1", direction="credit", amount=60000,
                  timestamp=datetime(2026, 7, 6, 12, 0),
                  narration="TRF FROM IYABO AJO PAYOUT", counterparty_name="IYABO")
    res = CommunalClassifier().classify(txns + [payout], user)
    assert res.tag_by_id().get("p1") == "ajo_payout"


# --- lexicon + graph units ----------------------------------------------------------

def test_merchant_bill_detection():
    assert is_merchant_or_bill("POS PURCHASE SHOPRITE LEKKI")
    assert is_merchant_or_bill("TRF FROM FLUTTERWAVE MERCHANT PAYOUT")
    assert is_merchant_or_bill("TRF TO BABATUNDE PROPERTIES RENT")
    assert not is_merchant_or_bill("TRF TO MAMA EMEKA UPKEEP")


def test_direction_gated_cues():
    assert cue_hits("dependent", "TRF TO MAMA EMEKA UPKEEP ONITSHA")
    assert cue_hits("remittance_in", "INWARD REMITTANCE WORLDREMIT FROM UK")
    assert not cue_hits("ajo", "POS PURCHASE SHOPRITE")


def test_relationship_graph_reciprocity(persona_batches):
    batch = persona_batches["persona_c"]
    _g, stats = build_relationship_graph(batch.transactions, batch.user)
    assert stats["IYABO ADISA"].reciprocal   # contributes + receives payout
    assert stats["CHIDI OKEKE"].reciprocal    # lent out + repaid
    assert not stats["TUNDE ADEYEMI"].reciprocal  # pure dependent (out only)


# --- the classifier must never read eval-only labels --------------------------------

def test_classifier_ignores_eval_labels(persona_batches):
    batch = persona_batches["persona_c"]
    dres = DedupEngine().dedup(batch.transactions, batch.user)
    skip = set(dres.internal_transfer_ids)
    clf = CommunalClassifier()
    baseline = clf.classify(batch.transactions, batch.user, skip_ids=skip).tag_by_id()

    # scramble every communal_tag to a wrong value; predictions must not change
    scrambled = [t.model_copy(update={"communal_tag": "dependent"}) for t in batch.transactions]
    after = clf.classify(scrambled, batch.user, skip_ids=skip).tag_by_id()
    assert baseline == after

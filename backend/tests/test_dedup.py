"""Tests for the cross-institution transfer dedup engine."""

from __future__ import annotations

from datetime import datetime

from app.datasets import load_batch
from app.dedup.engine import DedupEngine
from app.dedup.evaluation import evaluate
from app.dedup.normalize import clean_name, extract_references
from app.dedup.scorer import LogisticScorer
from app.dedup.similarity import DedupConfig, extract_features
from app.schemas.transaction import Transaction, UserProfile


def _txn(**kw) -> Transaction:
    base = dict(
        id="x", account_id="a", institution="gtbank", amount=1000.0,
        direction="debit", timestamp=datetime(2026, 10, 1, 12, 0), narration="",
    )
    base.update(kw)
    return Transaction(**base)


# --- normalization -----------------------------------------------------------------

def test_clean_name_strips_bank_and_transfer_noise():
    assert clean_name("TRF/STEPHEN VINCENT/to self GTB-KUDA/REF:100033445566") == "STEPHEN VINCENT"
    assert clean_name("NIP:ACCESS:TO KUDA MFB:STEPHEN VINCENT:0987766554433") == "STEPHEN VINCENT"
    # a purchase keeps merchant words but nothing resembling the account holder
    assert clean_name("POS PURCHASE SHOPRITE LEKKI LAGOS") == "PURCHASE SHOPRITE LEKKI LAGOS"


def test_extract_references_catches_ref_and_session_ids():
    refs = extract_references("TRF/STEPHEN/REF:100033445566")
    assert "100033445566" in refs
    assert extract_references("Transfer from X") == set()


# --- end-to-end on the labelled sample ---------------------------------------------

def test_sample_dataset_perfect_recall_and_precision():
    batch = load_batch()
    result = DedupEngine().dedup(batch.transactions, batch.user)
    metrics = evaluate(result, batch)
    assert metrics.recall == 1.0
    assert metrics.precision == 1.0
    assert metrics.gold_pairs == 3


def test_totals_report_phantom_inflation():
    batch = load_batch()
    result = DedupEngine().dedup(batch.transactions, batch.user)
    t = result.totals
    # removing transfers must lower both gross figures
    assert t.net_income < t.gross_income
    assert t.net_spending < t.gross_spending
    assert t.income_inflation_pct > 0
    assert t.spending_inflation_pct > 0


def test_decoy_same_amount_different_payee_not_matched():
    """A rent debit and a freelance credit of ~equal value must NOT be deduped."""
    batch = load_batch()
    result = DedupEngine().dedup(batch.transactions, batch.user)
    matched_ids = {m.debit.id for m in result.matches} | {m.credit.id for m in result.matches}
    assert "d5" not in matched_ids  # rent to landlord
    assert "c3" not in matched_ids  # freelance income


# --- feasibility gates --------------------------------------------------------------

def test_credit_before_debit_is_infeasible():
    from app.dedup.similarity import is_feasible

    cfg = DedupConfig()
    debit = _txn(id="d", account_id="a", direction="debit", amount=5000,
                 timestamp=datetime(2026, 10, 4, 14, 0))
    credit = _txn(id="c", account_id="b", institution="kuda", direction="credit",
                  amount=5000, timestamp=datetime(2026, 10, 4, 11, 0))
    f = extract_features(debit, credit, UserProfile(user_id="u", full_name="Z"))
    assert is_feasible(debit, credit, f, cfg) is False


def test_same_account_is_infeasible():
    from app.dedup.similarity import is_feasible

    cfg = DedupConfig()
    debit = _txn(id="d", account_id="a", direction="debit", amount=5000)
    credit = _txn(id="c", account_id="a", direction="credit", amount=5000,
                  timestamp=datetime(2026, 10, 1, 12, 1))
    f = extract_features(debit, credit, UserProfile(user_id="u", full_name="Z"))
    assert is_feasible(debit, credit, f, cfg) is False


# --- learned scorer can be swapped in -----------------------------------------------

def test_logistic_scorer_falls_back_until_fitted_then_matches():
    batch = load_batch()
    scorer = LogisticScorer()
    assert scorer.is_fitted is False
    # unfitted => rule-based fallback still recovers all transfers
    result = DedupEngine(scorer=scorer).dedup(batch.transactions, batch.user)
    assert evaluate(result, batch).recall == 1.0

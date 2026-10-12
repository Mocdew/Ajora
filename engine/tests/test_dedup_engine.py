"""Engine-level tests for the relocated, improved dedup pipeline.

Covers the four-stage spec: FX-aware candidate matching, the user-pattern priors,
the Hungarian pairing leaving hard negatives unmatched, the confidence tiers, and the
explicit deduped-ledger / before-after-totals outputs. The precision/recall numbers
here are the contract the harness optimizes against.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from engine.dedup.engine import DedupEngine
from engine.dedup.evaluation import evaluate
from engine.dedup.similarity import BatchContext, DedupConfig, extract_features
from engine.schemas.transaction import Transaction, UserProfile


def _by_narration(batch, needle):
    return next(t for t in batch.transactions if needle in t.narration)


# --- precision / recall across the labelled set -------------------------------------

def test_every_dataset_is_perfect(all_batches):
    """Aggregate and per-dataset precision/recall/F1 are all 1.0 on the labelled set."""
    tp = fp = fn = 0
    for batch in all_batches:
        result = DedupEngine().dedup(batch.transactions, batch.user)
        m = evaluate(result, batch)
        assert m.precision == 1.0, (batch.user.user_id, m.as_dict())
        assert m.recall == 1.0, (batch.user.user_id, m.as_dict())
        tp, fp, fn = tp + m.true_positives, fp + m.false_positives, fn + m.false_negatives
    assert (fp, fn) == (0, 0)
    assert tp == 18  # 3 sample + 5 A + 8 B + 2 C gold pairs


# --- FX / cross-currency (the known hard case) --------------------------------------

def test_cross_currency_self_transfer_is_caught(persona_batches):
    """Persona B's USD domiciliary debit ($150) must now match its NGN credit (₦231,750)."""
    batch = persona_batches["persona_b"]
    result = DedupEngine().dedup(batch.transactions, batch.user)

    fx = [m for m in result.matches if m.cross_currency]
    assert len(fx) == 1
    m = fx[0]
    assert {m.debit.currency, m.credit.currency} == {"USD", "NGN"}
    assert m.debit.amount == 150.0
    assert m.credit.amount == 231750.0
    assert m.tier == "high"          # auto-accept
    assert m.fee > 0                 # NGN-equivalent FX spread, not a nonsense subtraction


def test_fx_rate_is_a_band_not_a_memorized_point():
    """The configured rate (1550) is deliberately *not* the implied point rate (1545);
    the match must ride on the ±5% band, proving we didn't fit a single data point."""
    cfg = DedupConfig()
    implied = 231750.0 / 150.0  # ~1545.0
    assert cfg.fx_rates_ngn["USD"] != implied
    # 150 USD at the configured rate lands within the FX tolerance band of the NGN leg.
    debit_ngn = cfg.to_ngn(150.0, "USD")
    rel = abs(debit_ngn - 231750.0) / debit_ngn
    assert 0 < rel <= cfg.amount_tol_fraction_fx


# --- hard negatives stay unmatched (precision) --------------------------------------

def test_hard_negatives_are_not_matched(persona_batches):
    a = persona_batches["persona_a"]
    b = persona_batches["persona_b"]
    ra = DedupEngine().dedup(a.transactions, a.user)
    rb = DedupEngine().dedup(b.transactions, b.user)
    a_matched = {m.debit.id for m in ra.matches} | {m.credit.id for m in ra.matches}
    b_matched = {m.debit.id for m in rb.matches} | {m.credit.id for m in rb.matches}
    assert _by_narration(a, "DANGOTE REFINERY").id not in a_matched
    assert _by_narration(b, "JULIUS BERGER").id not in b_matched


def test_subthreshold_edges_cannot_displace_an_accepted_match():
    """Weak edges must not change the assignment before they are rejected."""
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)

    def transaction(txn_id, account_id, institution, direction, hours):
        return Transaction(
            id=txn_id,
            account_id=account_id,
            institution=institution,
            amount=10_000,
            currency="NGN",
            direction=direction,
            timestamp=base + timedelta(hours=hours),
        )

    class MatrixScorer:
        def score(self, features, debit, config):
            return {
                ("d1", 1.0): 0.90,
                ("d1", 2.0): 0.54,
                ("d2", 1.0): 0.54,
                ("d2", 2.0): 0.00,
            }[(debit.id, features.time_gap_hours)]

    transactions = [
        transaction("d1", "a1", "bank-1", "debit", 0),
        transaction("d2", "a2", "bank-2", "debit", 0),
        transaction("c1", "a3", "bank-3", "credit", 1),
        transaction("c2", "a4", "bank-4", "credit", 2),
    ]
    user = UserProfile(user_id="u", full_name="Test User")

    result = DedupEngine(scorer=MatrixScorer()).dedup(transactions, user)

    assert [(m.debit.id, m.credit.id, m.score) for m in result.matches] == [
        ("d1", "c1", 0.9)
    ]


def test_transaction_normalizes_currency_and_timestamp_to_utc():
    naive = Transaction(
        id="naive",
        account_id="a1",
        institution="bank-1",
        amount=1_000,
        currency=" ngn ",
        direction="debit",
        timestamp=datetime(2026, 1, 1, 12, 0),
    )
    offset = Transaction(
        id="offset",
        account_id="a2",
        institution="bank-2",
        amount=1_000,
        currency="ngn",
        direction="credit",
        timestamp=datetime.fromisoformat("2026-01-01T13:00:00+01:00"),
    )

    assert naive.currency == offset.currency == "NGN"
    assert naive.timestamp.tzinfo == timezone.utc
    assert offset.timestamp.tzinfo == timezone.utc
    assert naive.timestamp == offset.timestamp
    DedupEngine().dedup(
        [naive, offset], UserProfile(user_id="u", full_name="Test User")
    )


# --- user-pattern priors ------------------------------------------------------------

def test_recurring_route_prior_fires_on_monthly_sweeps(persona_batches):
    """Persona A sweeps gtb->kuda every month; that route must recur (>=2) in context."""
    batch = persona_batches["persona_a"]
    debits = [t for t in batch.transactions if t.direction == "debit"]
    credits = [t for t in batch.transactions if t.direction == "credit"]
    ctx = DedupEngine()._build_context(debits, credits, batch.user)
    assert ctx.route_counts.get(("gtb-a01", "kuda-a02"), 0) >= 2

    # a concrete sweep pair carries the recurrence + round-amount prior features
    sweep_debit = _by_narration(batch, "to self GTBANK-KUDA")
    sweep_credit = next(
        c for c in credits if c.transfer_pair_id == sweep_debit.transfer_pair_id
    )
    f = extract_features(sweep_debit, sweep_credit, batch.user, DedupConfig(), ctx)
    assert f.route_recurrence >= 2
    assert f.round_amount == 1


# --- stage-4 outputs ----------------------------------------------------------------

def test_deduped_ledger_removes_both_legs_of_every_match(persona_batches):
    batch = persona_batches["persona_b"]
    result = DedupEngine().dedup(batch.transactions, batch.user)
    internal = set(result.internal_transfer_ids)
    # each match contributes exactly its two legs
    assert internal == {m.debit.id for m in result.matches} | {m.credit.id for m in result.matches}
    assert len(internal) == 2 * len(result.matches)
    deduped_ids = {t.id for t in result.deduped_transactions}
    assert deduped_ids.isdisjoint(internal)
    assert len(result.deduped_transactions) == len(batch.transactions) - len(internal)


def test_totals_are_ngn_normalized_and_show_inflation(persona_batches):
    batch = persona_batches["persona_b"]
    t = DedupEngine().dedup(batch.transactions, batch.user).totals
    assert t.net_income < t.gross_income
    assert t.net_spending < t.gross_spending
    assert t.income_inflation_pct > 0 and t.spending_inflation_pct > 0

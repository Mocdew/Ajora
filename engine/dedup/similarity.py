"""Pairwise scoring for candidate (debit, credit) transfer pairs.

Given a debit leg from one account and a credit leg from another, we decide:
  - is this pair even *feasible* (right directions, different accounts, amount and
    timing in a transfer-plausible range), and
  - a continuous *score* in [0, 1] for how transfer-like it is.

The feature vector (`PairFeatures`) is deliberately exposed: the rule-based score here
is the bootstrap, but the same features feed the scikit-learn confidence scorer once
labelled pairs exist (see `scorer.py`). Keeping one feature definition avoids train/serve
skew.

Two improvements over the first cut, both driven by the labelled set:

* **FX / cross-currency matching.** A domiciliary (e.g. USD) debit and its NGN credit
  are the *same* money moved across a currency boundary, but their raw amounts are
  orders of magnitude apart. Before the amount gate we convert every leg to NGN via a
  configurable rate map (:attr:`DedupConfig.fx_rates_ngn`) and, for cross-currency
  pairs, apply a **wider tolerance band** (FX spread) instead of the tight fee band.
  The rate is a realistic market rate, not fitted to any single data point.

* **Simple user-pattern priors.** Manual multi-bank sweeps recur: the same
  ``source account -> destination account`` route shows up month after month, and the
  amounts are round (₦50k, ₦100k, ...). A small prior rewards a pair whose route recurs
  in the batch and whose amount is round. It is deliberately *small* and only nudges the
  weighted path — a shared reference still short-circuits to near-certainty, and the
  global Hungarian assignment still decides who claims whom, so the prior cannot
  manufacture a false positive on its own.

Pure: pydantic (via the schema) + rapidfuzz + stdlib. No web/DB/network.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Dict, Optional, Tuple

from rapidfuzz import fuzz

from ..schemas.transaction import Transaction, UserProfile
from .normalize import clean_name, extract_references

# A sentinel amount gap used when a cross-currency pair cannot be converted (unknown
# currency). Large enough that any tolerance band rejects the pair.
_UNCONVERTIBLE = 1.0e9


@dataclass(frozen=True)
class DedupConfig:
    """Tunable thresholds. Defaults target Nigerian inter-bank (NIP) behaviour."""

    max_window_hours: float = 48.0        # credit should land within ~2 days of the debit
    max_clock_skew_hours: float = 0.5     # tolerate a credit timestamped slightly *before*
    max_fee_fraction: float = 0.02        # fee rarely exceeds 2% of the amount...
    max_fee_abs: float = 200.0            # ...or ~N200 absolute (NIP fees are small, flat-ish)
    amount_tol_fraction: float = 0.02     # same-currency: beyond this relative gap, not a pair

    # FX / cross-currency matching ------------------------------------------------
    # NGN per 1 unit of the quoted currency. A realistic market rate band, NOT fitted
    # to reproduce any single labelled amount (the labelled USD->NGN leg implies ~1545;
    # we use 1550 so the match rides on the tolerance band, not a memorized point).
    fx_rates_ngn: Dict[str, float] = field(default_factory=lambda: {"USD": 1550.0})
    amount_tol_fraction_fx: float = 0.05  # cross-currency: wider band absorbs the FX spread

    # score component weights (normalized internally) -----------------------------
    w_amount: float = 0.33
    w_time: float = 0.17
    w_name: float = 0.22
    w_user: float = 0.20
    w_prior: float = 0.08                 # small user-pattern prior (route recurrence + round amt)

    # decision thresholds on the final score --------------------------------------
    accept_threshold: float = 0.55        # below this: not a transfer at all
    tier_high: float = 0.85
    tier_medium: float = 0.65

    def rate_to_ngn(self, currency: str) -> Optional[float]:
        """NGN-per-unit rate for ``currency`` (1.0 for NGN; None if unknown)."""
        if currency == "NGN":
            return 1.0
        return self.fx_rates_ngn.get(currency)

    def to_ngn(self, amount: float, currency: str) -> Optional[float]:
        """Convert ``amount`` in ``currency`` to NGN, or None if the rate is unknown."""
        rate = self.rate_to_ngn(currency)
        return None if rate is None else amount * rate


@dataclass(frozen=True)
class BatchContext:
    """Batch-level signal used by the simple user-pattern priors.

    ``route_counts`` maps a directed ``(debit_account_id, credit_account_id)`` route to
    how many feasible candidate pairs in this batch travel it. A route a user sweeps
    every month recurs; a one-off third-party payment does not. Built once by the
    engine over the feasible candidate set (never over ground-truth labels).
    """

    route_counts: Dict[Tuple[str, str], int] = field(default_factory=dict)

    def route_recurrence(self, debit: Transaction, credit: Transaction) -> int:
        return self.route_counts.get((debit.account_id, credit.account_id), 0)


@dataclass(frozen=True)
class PairFeatures:
    amount_rel_diff: float   # (debit_ngn - credit_ngn) / debit_ngn; >0 means debit larger (fee/spread)
    fee_abs: float           # debit_ngn - credit_ngn, in NGN
    time_gap_hours: float    # credit.timestamp - debit.timestamp, in hours (signed)
    name_sim: float          # leg-to-leg counterparty similarity, 0..1
    user_name_sim: float     # best leg-to-user-name similarity, 0..1
    ref_match: int           # 1 if the two legs share a reference token
    cross_institution: int   # 1 if the legs are at different banks
    cross_currency: int      # 1 if the legs are in different currencies (FX pair)
    route_recurrence: int    # how many times this source->dest route recurs in the batch
    round_amount: int        # 1 if the debit is a round manual-sweep amount (NGN)

    def as_dict(self) -> dict[str, float]:
        return asdict(self)


def _name_similarity(a: str, b: str) -> float:
    """token_set_ratio handles reordered / partial names ("STEPHEN VINCENT" vs
    "VINCENT STEPHEN O"). Empty on either side => no signal (0)."""
    if not a or not b:
        return 0.0
    return fuzz.token_set_ratio(a, b) / 100.0


def _is_round_amount(amount_ngn: float) -> bool:
    """A manual sweep is almost always a round figure (multiple of ₦5,000).

    Checked on the NGN-normalized amount so an FX leg is judged on its naira value.
    This is a weak signal on its own (rent can be round too) — it only contributes a
    fraction of the small prior, gated further by route recurrence.
    """
    if amount_ngn <= 0:
        return False
    return round(amount_ngn) % 5000 == 0


def extract_features(
    debit: Transaction,
    credit: Transaction,
    user: UserProfile,
    cfg: Optional[DedupConfig] = None,
    context: Optional[BatchContext] = None,
) -> PairFeatures:
    """Build the feature vector for one candidate (debit, credit) pair.

    ``cfg`` supplies FX rates (defaults to :class:`DedupConfig`); ``context`` supplies
    the batch-level route-recurrence prior (absent => prior is zero, so a bare unit
    call is unchanged in behaviour).
    """
    cfg = cfg or DedupConfig()

    debit_ngn = cfg.to_ngn(debit.amount, debit.currency)
    credit_ngn = cfg.to_ngn(credit.amount, credit.currency)
    cross_currency = 1 if debit.currency != credit.currency else 0

    if debit_ngn is None or credit_ngn is None or debit_ngn <= 0:
        # Unknown currency on one leg: make the pair fail every amount tolerance.
        rel_diff = _UNCONVERTIBLE
        fee_abs = _UNCONVERTIBLE
        round_amount = 0
    else:
        rel_diff = (debit_ngn - credit_ngn) / debit_ngn
        fee_abs = debit_ngn - credit_ngn
        round_amount = 1 if _is_round_amount(debit_ngn) else 0

    time_gap = (credit.timestamp - debit.timestamp).total_seconds() / 3600.0

    debit_name = clean_name(debit.narration, extra=debit.counterparty_name)
    credit_name = clean_name(credit.narration, extra=credit.counterparty_name)
    name_sim = _name_similarity(debit_name, credit_name)

    # Does either leg's counterparty look like the user themselves? Strong self-transfer cue.
    user_candidates = [clean_name(user.full_name), *(clean_name(a) for a in user.aliases)]
    user_candidates = [c for c in user_candidates if c]
    user_sim = 0.0
    for leg_name in (debit_name, credit_name):
        for cand in user_candidates:
            user_sim = max(user_sim, _name_similarity(leg_name, cand))

    shared_refs = extract_references(
        f"{debit.narration} {debit.reference or ''}"
    ) & extract_references(f"{credit.narration} {credit.reference or ''}")

    route_recurrence = context.route_recurrence(debit, credit) if context else 0

    return PairFeatures(
        amount_rel_diff=rel_diff,
        fee_abs=fee_abs,
        time_gap_hours=time_gap,
        name_sim=name_sim,
        user_name_sim=user_sim,
        ref_match=1 if shared_refs else 0,
        cross_institution=1 if debit.institution != credit.institution else 0,
        cross_currency=cross_currency,
        route_recurrence=route_recurrence,
        round_amount=round_amount,
    )


def is_feasible(debit: Transaction, credit: Transaction, f: PairFeatures, cfg: DedupConfig) -> bool:
    """Hard gates. A pair failing any of these can never be a self-transfer, so it is
    excluded from the assignment entirely (keeps the cost matrix meaningful)."""
    if debit.direction != "debit" or credit.direction != "credit":
        return False
    if debit.account_id == credit.account_id:
        return False  # within one account is not a cross-account transfer

    # amount gate (on NGN-normalized magnitudes) ---------------------------------
    if f.cross_currency:
        # Cross-currency: the FX spread can push the credit slightly above or below the
        # debit's naira value, so judge purely on a symmetric, wider band.
        if abs(f.amount_rel_diff) > cfg.amount_tol_fraction_fx:
            return False
    else:
        # Same currency: the credit must not exceed the debit beyond rounding, and the
        # gap must be small (either within tolerance or explained by a small NIP fee).
        if f.amount_rel_diff < -0.005:
            return False
        fee_ok = f.fee_abs <= max(cfg.max_fee_abs, cfg.max_fee_fraction * debit.amount)
        if abs(f.amount_rel_diff) > cfg.amount_tol_fraction and not fee_ok:
            return False

    # timing: credit at/after debit (allow small negative clock skew), within the window
    if f.time_gap_hours < -cfg.max_clock_skew_hours:
        return False
    if f.time_gap_hours > cfg.max_window_hours:
        return False
    return True


def _prior_component(f: PairFeatures) -> float:
    """The simple user-pattern prior, in [0, 1].

    A recurring route (the dominant signal of a habitual sweep) is worth most; a round
    amount adds a little. Both together => 1.0. Neither => 0.0 (no nudge).
    """
    prior = 0.0
    if f.route_recurrence >= 2:
        prior += 0.6
    if f.round_amount:
        prior += 0.4
    return min(1.0, prior)


def rule_score(f: PairFeatures, debit: Transaction, cfg: DedupConfig) -> float:
    """Bootstrap score in [0, 1] from the feature vector. A shared reference short-circuits
    to near-certainty; otherwise a weighted blend of amount, timing, name and prior signals."""
    if f.ref_match:
        return 0.98

    fee_ok = f.fee_abs <= max(cfg.max_fee_abs, cfg.max_fee_fraction * debit.amount)
    if abs(f.amount_rel_diff) <= 0.005 or fee_ok or (
        f.cross_currency and abs(f.amount_rel_diff) <= cfg.amount_tol_fraction_fx
    ):
        amount_score = 1.0
    else:
        tol = cfg.amount_tol_fraction_fx if f.cross_currency else cfg.amount_tol_fraction
        amount_score = max(0.0, 1.0 - abs(f.amount_rel_diff) / tol)

    gap = max(0.0, f.time_gap_hours)
    time_score = max(0.0, 1.0 - gap / cfg.max_window_hours)

    name_score = f.name_sim
    user_score = f.user_name_sim
    prior_score = _prior_component(f)

    w = cfg.w_amount + cfg.w_time + cfg.w_name + cfg.w_user + cfg.w_prior
    return (
        cfg.w_amount * amount_score
        + cfg.w_time * time_score
        + cfg.w_name * name_score
        + cfg.w_user * user_score
        + cfg.w_prior * prior_score
    ) / w


def build_reasons(f: PairFeatures, score: float) -> list[str]:
    reasons: list[str] = []
    if f.ref_match:
        reasons.append("Shared transfer reference on both legs")
    if f.cross_currency:
        reasons.append("Cross-currency self-transfer matched at the configured FX rate")
    if abs(f.amount_rel_diff) <= 0.005:
        reasons.append("Exact amount match")
    elif f.fee_abs > 0 and not f.cross_currency:
        reasons.append(f"Amount matches net of ~{f.fee_abs:,.0f} fee")
    if f.user_name_sim >= 0.8:
        reasons.append("Counterparty matches the account holder's own name")
    elif f.name_sim >= 0.8:
        reasons.append("Both legs name the same counterparty")
    if 0 <= f.time_gap_hours <= 1:
        reasons.append("Credit landed within an hour of the debit")
    if f.cross_institution:
        reasons.append("Moves between two different banks")
    if f.route_recurrence >= 2:
        reasons.append("Repeats a source->destination route the user sweeps regularly")
    return reasons

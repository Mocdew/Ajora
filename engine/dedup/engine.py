"""Cross-institution transfer dedup engine.

The core IP, stage 1. A user who moves money between their own banks produces a debit
on one account and a mirror credit on another. Every aggregator that naively sums
credits as "income" and debits as "spending" double-counts this money, inflating both
by 30–40%. This engine finds those mirror pairs and nets them out.

Pipeline (the four stages):
  1. **Candidate match** — for each debit, consider credit legs in *other* accounts
     within the time window and an amount band that allows for fees AND FX (cross-currency
     legs are converted to NGN first, then judged on a wider spread band).
  2. **Scoring** — score every feasible (debit, credit) pair on amount closeness (net of
     fee/FX), timing, RapidFuzz name/narration similarity, and a small user-pattern prior
     (recurring source->destination route + round sweep amount).
  3. **Optimal pairing** — a global one-to-one assignment with the Hungarian algorithm
     (`scipy.optimize.linear_sum_assignment`) so each leg is matched at most once and the
     overall matching is optimal, never greedy.
  4. **Confidence tiers** — drop assignments below the accept threshold, tier the rest
     (high = auto-accept, medium = confirm, low = dropped), and report both the deduped
     ledger and before/after totals.

Stateless and in-memory, per the no-database architecture. Pure: numpy + scipy +
(transitively) rapidfuzz/pydantic. No web/DB/network.
"""

from __future__ import annotations

from collections import Counter
from typing import Dict, Mapping, Tuple

import numpy as np
from scipy.optimize import linear_sum_assignment

from ..schemas.dedup import DedupResult, MatchedTransfer, Totals, Verdict
from ..schemas.transaction import Transaction, UserProfile
from .scorer import RuleBasedScorer, Scorer, tier_for
from .similarity import (
    BatchContext,
    DedupConfig,
    PairFeatures,
    build_reasons,
    extract_features,
    is_feasible,
)

# Cost assigned to an infeasible pairing. Large enough to never be chosen over any real
# match, finite so linear_sum_assignment stays well-defined on padded matrices.
_INFEASIBLE_COST = 1.0e6


class UnsupportedCurrencyError(ValueError):
    """NGN totals cannot be calculated until this currency has a conversion rate."""


class DedupEngine:
    def __init__(self, config: DedupConfig | None = None, scorer: Scorer | None = None) -> None:
        self.cfg = config or DedupConfig()
        self.scorer = scorer or RuleBasedScorer()

    def dedup(
        self,
        transactions: list[Transaction],
        user: UserProfile,
        verdicts: Mapping[str, Verdict] | None = None,
    ) -> DedupResult:
        debits = [t for t in transactions if t.direction == "debit"]
        credits = [t for t in transactions if t.direction == "credit"]

        matches = self._match(debits, credits, user, verdicts or {})
        applied = [m for m in matches if m.verdict == "confirm" or
                   (m.verdict is None and m.tier == "high")]
        internal_ids = {leg.id for m in applied for leg in (m.debit, m.credit)}
        paired_ids = {leg.id for m in matches for leg in (m.debit, m.credit)}

        # Legs that look transfer-like (name themselves / round, recent) but found no
        # confident partner — surfaced so the UI can ask, and for debugging recall.
        candidates = [
            t
            for t in transactions
            if t.id not in paired_ids and self._looks_transferish(t, user)
        ]

        # Keep the fee (or favourable FX difference) as a separate NGN entry at the
        # residual leg's date. Only the principal disappears from honest cashflow.
        used_ids = {t.id for t in transactions}
        residuals = {}
        for m in applied:
            if not m.fee:
                continue
            leg = m.debit if m.fee > 0 else m.credit
            residual_id = f"settlement:{leg.id}"
            while residual_id in used_ids:
                residual_id += ":"
            used_ids.add(residual_id)
            residuals[leg.id] = Transaction(
                id=residual_id, account_id=leg.account_id, institution=leg.institution,
                amount=abs(m.fee), currency="NGN", direction=leg.direction,
                timestamp=leg.timestamp, narration="Bank transfer settlement adjustment",
                raw_category="transfer_fee" if m.fee > 0 else "transfer_gain",
            )
        deduped = [
            residuals.get(t.id, t) for t in transactions
            if t.id not in internal_ids or t.id in residuals
        ]

        return DedupResult(
            matches=matches,
            totals=self._totals(debits, credits, deduped),
            unmatched_transfer_candidates=candidates,
            deduped_transactions=deduped,
            internal_transfer_ids=sorted(internal_ids),
        )

    def _build_context(
        self, debits: list[Transaction], credits: list[Transaction], user: UserProfile
    ) -> BatchContext:
        """Count, over the feasible candidate pairs, how often each directed
        ``(debit_account -> credit_account)`` route appears. Feasibility here does not
        depend on the route-recurrence prior, so this pass is self-consistent."""
        routes: Counter[Tuple[str, str]] = Counter()
        for d in debits:
            for c in credits:
                f = extract_features(d, c, user, self.cfg, context=None)
                if is_feasible(d, c, f, self.cfg):
                    routes[(d.account_id, c.account_id)] += 1
        return BatchContext(route_counts=dict(routes))

    def _match(
        self, debits: list[Transaction], credits: list[Transaction], user: UserProfile,
        verdicts: Mapping[str, Verdict],
    ) -> list[MatchedTransfer]:
        if not debits or not credits:
            return []

        context = self._build_context(debits, credits, user)

        cost = np.full((len(debits), len(credits)), _INFEASIBLE_COST, dtype=float)
        # cache features for the pairs we end up accepting, to avoid recomputing
        feat_cache: Dict[Tuple[int, int], Tuple[PairFeatures, float]] = {}

        for i, d in enumerate(debits):
            for j, c in enumerate(credits):
                f = extract_features(d, c, user, self.cfg, context=context)
                if not is_feasible(d, c, f, self.cfg):
                    continue
                s = self.scorer.score(f, d, self.cfg)
                if s < max(self.cfg.accept_threshold, self.cfg.tier_medium):
                    continue
                cost[i, j] = 1.0 - s
                feat_cache[(i, j)] = (f, s)

        row_ind, col_ind = linear_sum_assignment(cost)

        matches: list[MatchedTransfer] = []
        for i, j in zip(row_ind, col_ind):
            if (i, j) not in feat_cache:
                continue  # assignment landed on an infeasible cell (count mismatch padding)
            f, s = feat_cache[(i, j)]
            d, c = debits[i], credits[j]
            match_id = f"{d.id}:{c.id}"
            matches.append(
                MatchedTransfer(
                    match_id=match_id,
                    debit=d,
                    credit=c,
                    score=round(s, 4),
                    tier=tier_for(s, self.cfg),
                    verdict=verdicts.get(match_id),
                    credit_amount_ngn=round(self._amount_ngn(c), 2),
                    fee=round(f.fee_abs, 2),  # NGN-normalized (debit_ngn - credit_ngn)
                    cross_currency=bool(f.cross_currency),
                    reasons=build_reasons(f, s),
                )
            )
        return matches

    def _looks_transferish(self, t: Transaction, user: UserProfile) -> bool:
        from .normalize import clean_name
        from .similarity import _name_similarity

        name = clean_name(t.narration, extra=t.counterparty_name)
        for cand in (user.full_name, *user.aliases):
            if _name_similarity(name, clean_name(cand)) >= 0.8:
                return True
        return False

    def _amount_ngn(self, t: Transaction) -> float:
        """NGN value of a leg, so totals stay in one unit across a USD domiciliary mix."""
        v = self.cfg.to_ngn(t.amount, t.currency)
        if v is None:
            raise UnsupportedCurrencyError(f"No NGN exchange rate configured for {t.currency}.")
        return v

    def _totals(
        self,
        debits: list[Transaction],
        credits: list[Transaction],
        ledger: list[Transaction],
    ) -> Totals:
        gross_income = sum(self._amount_ngn(c) for c in credits)
        gross_spending = sum(self._amount_ngn(d) for d in debits)
        net_income = sum(self._amount_ngn(t) for t in ledger if t.direction == "credit")
        net_spending = sum(self._amount_ngn(t) for t in ledger if t.direction == "debit")

        def inflation(gross: float, net: float) -> float:
            return round((gross - net) / net * 100.0, 1) if net > 0 else 0.0

        return Totals(
            gross_income=round(gross_income, 2),
            gross_spending=round(gross_spending, 2),
            transfer_volume=round(gross_spending - net_spending, 2),
            net_income=round(net_income, 2),
            net_spending=round(net_spending, 2),
            income_inflation_pct=inflation(gross_income, net_income),
            spending_inflation_pct=inflation(gross_spending, net_spending),
        )

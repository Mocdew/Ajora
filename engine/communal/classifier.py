"""Communal-finance classifier (stage 2).

Keyword-anchored, structurally-confirmed, deterministic. For each relationship transfer
(merchant/bill transactions and dedup'd self-transfer legs excluded) it scores the
direction-appropriate communal classes, combining:

  * lexicon cues in the narration (the anchor — see `lexicon.py`), and
  * structural signals from the NetworkX relationship graph (recurrence, reciprocity,
    lump-sum payout, prior-loan, cross-currency).

A class needs at least a cue OR a strong structural signature to fire; pure recurrence
is deliberately *not* enough to call something `dependent` (rent and gym recur too), so
precision holds on recurring business transfers. Output tiers: high => auto-classify,
medium => surface for confirmation, below accept => left untagged.

The classifier MUST NOT read `transfer_pair_id` / `communal_tag` — those are eval-only
ground truth. It is given the dedup stage's `internal_transfer_ids` via `skip_ids`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Set, Tuple

from ..schemas.communal import (
    ClassifiedTransaction,
    CommunalResult,
    CommunalSummaryRow,
    CommunalTag,
    CounterpartyRelationship,
)
from ..schemas.transaction import Transaction, UserProfile
from .graph import CounterpartyStats, build_relationship_graph, counterparty_key, to_ngn
from .lexicon import cue_hits, is_merchant_or_bill

_DEBIT_CLASSES: Tuple[CommunalTag, ...] = ("ajo", "dependent", "informal_loan_out")
_CREDIT_CLASSES: Tuple[CommunalTag, ...] = ("ajo_payout", "loan_repayment", "remittance_in")

# Tie-break priority when two classes score equally (more specific first).
_PRIORITY: Tuple[CommunalTag, ...] = (
    "remittance_in", "ajo_payout", "loan_repayment",
    "ajo", "informal_loan_out", "dependent",
)

_ROLE_BY_TAG: Dict[CommunalTag, str] = {
    "ajo": "ajo_group",
    "ajo_payout": "ajo_group",
    "dependent": "dependent",
    "informal_loan_out": "lender/borrower",
    "loan_repayment": "lender/borrower",
    "remittance_in": "remitter",
}


@dataclass(frozen=True)
class CommunalConfig:
    accept_threshold: float = 0.5
    tier_high: float = 0.75
    recurring_min_months: int = 3   # monthly cadence over >=3 distinct months
    payout_lump_multiple: float = 1.5  # a payout is >= this x the average contribution


class CommunalClassifier:
    def __init__(self, config: Optional[CommunalConfig] = None) -> None:
        self.cfg = config or CommunalConfig()

    def classify(
        self,
        transactions: List[Transaction],
        user: UserProfile,
        skip_ids: Optional[Set[str]] = None,
    ) -> CommunalResult:
        skip = skip_ids or set()
        _graph, stats = build_relationship_graph(transactions, user, skip_ids=skip)

        classified: List[ClassifiedTransaction] = []
        for t in transactions:
            if t.id in skip or is_merchant_or_bill(t.narration, t.counterparty_name):
                continue
            key = counterparty_key(t)
            if not key:
                continue
            st = stats.get(key)
            best = self._score_transaction(t, st)
            if best is None:
                continue
            tag, score, reasons = best
            if score < self.cfg.accept_threshold:
                continue
            classified.append(
                ClassifiedTransaction(
                    transaction=t,
                    tag=tag,
                    confidence=round(min(score, 0.99), 4),
                    tier="high" if score >= self.cfg.tier_high else "medium",
                    counterparty=key,
                    reasons=reasons,
                )
            )

        relationships = self._relationships(stats, classified)
        summary = self._summary(classified)
        return CommunalResult(
            classifications=classified, relationships=relationships, summary=summary
        )

    # --- scoring --------------------------------------------------------------------

    def _score_transaction(
        self, t: Transaction, st: Optional[CounterpartyStats]
    ) -> Optional[Tuple[CommunalTag, float, List[str]]]:
        classes = _DEBIT_CLASSES if t.direction == "debit" else _CREDIT_CLASSES
        scored: List[Tuple[CommunalTag, float, List[str]]] = []
        for tag in classes:
            s, reasons = self._score_class(tag, t, st)
            if s > 0:
                scored.append((tag, s, reasons))
        if not scored:
            return None
        # argmax, tie-broken by specificity priority
        scored.sort(key=lambda x: (-x[1], _PRIORITY.index(x[0])))
        return scored[0]

    def _score_class(
        self, tag: CommunalTag, t: Transaction, st: Optional[CounterpartyStats]
    ) -> Tuple[float, List[str]]:
        hits = cue_hits(tag, t.narration, t.counterparty_name)
        reasons: List[str] = []
        score = 0.0

        # `ajo_payout` and `loan_repayment` are *structural* classes: the words "payout"
        # / "repayment" also show up in business income (PSP settlements, scheduled debt),
        # so they may NOT fire on a cue alone — they require a reciprocal relationship.
        # Every other communal class is cue-anchored.
        structural_credit = {"ajo_payout", "loan_repayment"}
        if hits and tag not in structural_credit:
            score = 0.85 + min(0.06, 0.03 * (len(hits) - 1))
            reasons.append(f"narration cue: {', '.join(sorted(set(hits)))}")

        recurring = bool(
            st and st.months_active >= self.cfg.recurring_min_months and st.out_count >= 3
        )
        cross_currency = t.currency != "NGN"
        amt_ngn = to_ngn(t.amount, t.currency)

        if tag == "ajo":
            if recurring:
                score += 0.10
                reasons.append(f"recurring monthly contribution ({st.months_active} months)")
            if st and st.reciprocal:
                score += 0.03
                reasons.append("counterparty also paid a lump back (ajo payout)")
        elif tag == "dependent":
            if recurring:
                score += 0.10
                reasons.append(f"recurring monthly support ({st.months_active} months)")
            # pure recurrence is NOT enough on its own — require a cue to fire.
        elif tag == "informal_loan_out":
            if st and st.out_count == 1 and not st.reciprocal:
                reasons.append("one-off outflow to this person")
        elif tag == "ajo_payout":
            payout_like = bool(
                st and st.out_count >= 2
                and amt_ngn >= self.cfg.payout_lump_multiple * st.avg_out_ngn
            )
            if payout_like:
                # structural base (medium); a cue pushes it to auto-accept (high)
                score = 0.60 + (0.25 if hits else 0.0)
                reasons.append("lump received from a group we contribute to")
                if hits:
                    reasons.append(f"narration cue: {', '.join(sorted(set(hits)))}")
        elif tag == "loan_repayment":
            if st and st.out_count >= 1 and st.reciprocal:
                score = 0.58 + (0.25 if hits else 0.0)
                reasons.append("inflow from someone we previously sent money to")
                if hits:
                    reasons.append(f"narration cue: {', '.join(sorted(set(hits)))}")
        elif tag == "remittance_in":
            if cross_currency:
                score = max(score, 0.60)
                score += 0.10 if hits else 0.0
                reasons.append(f"cross-currency inflow ({t.currency})")

        return min(score, 0.99), reasons

    # --- relationship + summary aggregation -----------------------------------------

    def _relationships(
        self, stats: Dict[str, CounterpartyStats], classified: List[ClassifiedTransaction]
    ) -> List[CounterpartyRelationship]:
        tags_by_cp: Dict[str, List[CommunalTag]] = {}
        for c in classified:
            tags_by_cp.setdefault(c.counterparty, []).append(c.tag)

        rels: List[CounterpartyRelationship] = []
        for key, st in stats.items():
            tags = tags_by_cp.get(key, [])
            if not tags:
                continue  # only surface counterparties with a communal relationship
            role = _ROLE_BY_TAG.get(tags[0], "other")
            rels.append(
                CounterpartyRelationship(
                    name=key,
                    role=role,
                    out_total_ngn=round(st.out_total_ngn, 2),
                    in_total_ngn=round(st.in_total_ngn, 2),
                    out_count=st.out_count,
                    in_count=st.in_count,
                    months_active=st.months_active,
                    reciprocal=st.reciprocal,
                    tags=sorted(set(tags)),
                )
            )
        rels.sort(key=lambda r: r.out_total_ngn + r.in_total_ngn, reverse=True)
        return rels

    def _summary(self, classified: List[ClassifiedTransaction]) -> Dict[str, CommunalSummaryRow]:
        summary: Dict[str, CommunalSummaryRow] = {}
        for c in classified:
            amt = to_ngn(c.transaction.amount, c.transaction.currency)
            row = summary.get(c.tag)
            if row is None:
                summary[c.tag] = CommunalSummaryRow(count=1, total_ngn=round(amt, 2))
            else:
                summary[c.tag] = CommunalSummaryRow(
                    count=row.count + 1, total_ngn=round(row.total_ngn + amt, 2)
                )
        return summary

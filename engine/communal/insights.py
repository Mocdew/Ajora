"""Relationship-level insight layer (stage 2's structured output).

The classifier (`CommunalClassifier`) tags individual transactions. This layer rolls
those tags up into **one insight per external relationship** — who the user moves money
with, how much (net of what comes back), how often, and how big a share of their real
(deduped) income it is. That is the object the API serves and the GenAI explainer
narrates; the explainer explains these numbers, it never computes them.

Pipeline contract (must run in this order — "communal patterns only emerge after dedup"):

    dres = DedupEngine().dedup(batch.transactions, batch.user)
    insights = build_insights(dres, batch.user)

`build_insights` classifies `dres.deduped_transactions` (self-transfer legs already
removed) with `skip_ids=set(dres.internal_transfer_ids)` as belt-and-braces, then
aggregates. The six transaction tags collapse into four relationship types:

    ajo, ajo_payout          -> ajo_esusu
    dependent                -> dependent
    informal_loan_out, loan_repayment -> informal_lending   (net balance = lent - repaid)
    remittance_in            -> remittance   (model also supports the outward direction)

Purity: only pydantic / networkx-backed helpers. No eval-only labels are ever read
(`communal_tag` / `transfer_pair_id` are never touched here).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional, Set, Tuple

from ..schemas.communal import (
    Cadence,
    ClassifiedTransaction,
    CommunalInsight,
    CommunalInsights,
    CommunalResult,
    CommunalTag,
    RelationshipType,
)
from ..schemas.dedup import DedupResult
from ..schemas.transaction import UserProfile
from .classifier import CommunalClassifier
from .graph import to_ngn

# The six transaction tags collapse into the four relationship types.
TAG_TO_TYPE: Dict[CommunalTag, RelationshipType] = {
    "ajo": "ajo_esusu",
    "ajo_payout": "ajo_esusu",
    "dependent": "dependent",
    "informal_loan_out": "informal_lending",
    "loan_repayment": "informal_lending",
    "remittance_in": "remittance",
}

# Headline sentence per type for the explainer's `reasons`.
_TYPE_HEADLINE: Dict[RelationshipType, str] = {
    "ajo_esusu": "Rotating-savings (ajo/esusu) relationship: periodic contributions, lump payout on your turn.",
    "dependent": "Recurring dependent support (“black tax”) — money sent to a person on a regular basis.",
    "informal_lending": "Informal loan: money lent out, tracked by the net balance still owed to you.",
    "remittance": "Cross-currency remittance relationship.",
}


def build_insights(
    dedup_result: DedupResult,
    user: UserProfile,
    classifier: Optional[CommunalClassifier] = None,
) -> CommunalInsights:
    """Run the classifier on the deduped ledger, then roll up relationship insights.

    Operates ONLY on `dedup_result.deduped_transactions` (phantom self-transfers already
    removed) and passes `skip_ids=internal_transfer_ids` so no internal leg can leak in.
    """
    clf = classifier or CommunalClassifier()
    result = clf.classify(
        dedup_result.deduped_transactions,
        user,
        skip_ids=set(dedup_result.internal_transfer_ids),
    )
    return insights_from_result(result, dedup_result.totals.net_income)


def insights_from_result(result: CommunalResult, net_income_ngn: float) -> CommunalInsights:
    """Pure aggregation: CommunalResult + net income -> CommunalInsights.

    Split out from `build_insights` so the eval harness can classify once and reuse the
    same `CommunalResult` for both per-class P/R/F1 and insight-type detection.
    """
    groups: Dict[Tuple[str, RelationshipType], List[ClassifiedTransaction]] = defaultdict(list)
    for c in result.classifications:
        groups[(c.counterparty, TAG_TO_TYPE[c.tag])].append(c)

    insights: List[CommunalInsight] = [
        _build_one(cp, rtype, members, net_income_ngn)
        for (cp, rtype), members in groups.items()
    ]
    # Largest footprint first (|net| then volume) for a stable, legible ordering.
    insights.sort(
        key=lambda i: (abs(i.net_position_ngn), i.total_out_ngn + i.total_in_ngn),
        reverse=True,
    )
    return CommunalInsights(insights=insights, net_income_ngn=net_income_ngn)


# --- internals ----------------------------------------------------------------------

def _build_one(
    counterparty: str,
    rtype: RelationshipType,
    members: List[ClassifiedTransaction],
    net_income_ngn: float,
) -> CommunalInsight:
    out_total = 0.0
    in_total = 0.0
    for m in members:
        amt = to_ngn(m.transaction.amount, m.transaction.currency)
        if m.transaction.direction == "debit":
            out_total += amt
        else:
            in_total += amt
    net_position = out_total - in_total

    timestamps = sorted(m.transaction.timestamp for m in members)
    months = {(t.year, t.month) for t in timestamps}
    cadence = _infer_cadence(timestamps)

    confidence = max(m.confidence for m in members)
    tier = "high" if any(m.tier == "high" for m in members) else "medium"

    basis = _volume_basis(rtype, out_total, in_total, net_position)
    pct = round(100.0 * basis / net_income_ngn, 2) if net_income_ngn > 0 else 0.0

    tags = sorted({m.tag for m in members})
    reasons = _reasons(rtype, cadence, len(members), net_position, out_total, in_total, members)

    return CommunalInsight(
        counterparty=counterparty,
        relationship_type=rtype,
        confidence=round(confidence, 4),
        tier=tier,
        total_out_ngn=round(out_total, 2),
        total_in_ngn=round(in_total, 2),
        net_position_ngn=round(net_position, 2),
        count=len(members),
        cadence=cadence,
        first_seen=timestamps[0].date(),
        last_seen=timestamps[-1].date(),
        months_active=len(months),
        pct_of_net_income=pct,
        member_transaction_ids=[m.transaction.id for m in members],
        tags=tags,
        reasons=reasons,
    )


def _volume_basis(
    rtype: RelationshipType, out_total: float, in_total: float, net_position: float
) -> float:
    """The numerator for `pct_of_net_income`, chosen per type (documented on the field):

    * ajo_esusu / dependent -> outflow (what the user commits to send),
    * remittance            -> the dominant direction's volume (inflow for remittance_in),
    * informal_lending      -> net_position (outstanding exposure still owed to the user).
    """
    if rtype == "informal_lending":
        return abs(net_position)
    if rtype == "remittance":
        return in_total if in_total >= out_total else out_total
    return out_total  # ajo_esusu, dependent


def _infer_cadence(timestamps: List[datetime]) -> Cadence:
    if len(timestamps) <= 1:
        return "one-off"
    gaps = [
        (timestamps[i + 1] - timestamps[i]).days for i in range(len(timestamps) - 1)
    ]
    avg = sum(gaps) / len(gaps)
    if avg <= 10:
        return "weekly"
    if avg <= 20:
        return "biweekly"
    if avg <= 45:
        return "monthly"
    if avg <= 100:
        return "quarterly"
    return "irregular"


def _reasons(
    rtype: RelationshipType,
    cadence: Cadence,
    count: int,
    net_position: float,
    out_total: float,
    in_total: float,
    members: List[ClassifiedTransaction],
) -> List[str]:
    reasons: List[str] = [_TYPE_HEADLINE[rtype]]
    reasons.append(f"{count} transaction(s), {cadence} cadence")
    if rtype == "informal_lending":
        reasons.append(
            f"lent ₦{out_total:,.0f}, repaid ₦{in_total:,.0f} "
            f"→ ₦{net_position:,.0f} outstanding"
        )
    elif rtype == "ajo_esusu" and in_total > 0:
        reasons.append(
            f"contributed ₦{out_total:,.0f}, received ₦{in_total:,.0f} in payout(s)"
        )
    # fold in the distinct underlying classifier reasons (de-duplicated, order-stable)
    seen: Set[str] = set()
    for m in members:
        for r in m.reasons:
            if r not in seen:
                seen.add(r)
                reasons.append(r)
    return reasons

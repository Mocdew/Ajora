"""Eval harness for the communal-classification stage: per-class precision/recall/F1.

Ground truth is `Transaction.communal_tag` (eval-only). We compare the classifier's
predicted tag per transaction against the gold tag, as a multiclass problem:

  * a gold tag the classifier also predicted (same tag)     -> true positive for that tag
  * a gold tag missed or mislabelled                        -> false negative for that tag
  * a tag predicted where gold is None or a different tag    -> false positive for that tag

We report per-tag P/R/F1 plus macro- and micro-averages. Wire into CI alongside dedup.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, List, Optional, Set, Tuple

from ..schemas.communal import (
    CommunalInsights,
    CommunalResult,
    CommunalTag,
    RelationshipType,
)
from ..schemas.transaction import TransactionBatch
from .graph import counterparty_key
from .insights import TAG_TO_TYPE

ALL_TAGS: List[CommunalTag] = [
    "ajo", "ajo_payout", "dependent", "informal_loan_out", "loan_repayment", "remittance_in",
]


@dataclass(frozen=True)
class ClassMetrics:
    tag: str
    tp: int
    fp: int
    fn: int

    @property
    def precision(self) -> float:
        return self.tp / (self.tp + self.fp) if (self.tp + self.fp) else 1.0

    @property
    def recall(self) -> float:
        return self.tp / (self.tp + self.fn) if (self.tp + self.fn) else 1.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if (p + r) else 0.0


@dataclass
class CommunalMetrics:
    per_class: Dict[str, ClassMetrics]

    @property
    def micro(self) -> ClassMetrics:
        tp = sum(m.tp for m in self.per_class.values())
        fp = sum(m.fp for m in self.per_class.values())
        fn = sum(m.fn for m in self.per_class.values())
        return ClassMetrics("micro", tp, fp, fn)

    @property
    def macro_f1(self) -> float:
        present = [m for m in self.per_class.values() if (m.tp + m.fn) > 0]
        return sum(m.f1 for m in present) / len(present) if present else 0.0


def evaluate(result: CommunalResult, batch: TransactionBatch) -> CommunalMetrics:
    predicted: Dict[str, Optional[str]] = result.tag_by_id()
    gold: Dict[str, Optional[str]] = {t.id: t.communal_tag for t in batch.transactions}

    tp: Dict[str, int] = defaultdict(int)
    fp: Dict[str, int] = defaultdict(int)
    fn: Dict[str, int] = defaultdict(int)

    for tid, g in gold.items():
        p = predicted.get(tid)
        if g is not None and p == g:
            tp[g] += 1
        else:
            if g is not None:
                fn[g] += 1
            if p is not None:
                fp[p] += 1

    per_class = {
        tag: ClassMetrics(tag, tp[tag], fp[tag], fn[tag])
        for tag in ALL_TAGS
        if (tp[tag] + fp[tag] + fn[tag]) > 0
    }
    return CommunalMetrics(per_class=per_class)


# --- insight-level detection accuracy -----------------------------------------------
# Does the relationship-insight layer surface the right relationship TYPES (and no
# spurious ones)? We measure at (counterparty, relationship_type) granularity against
# the gold `communal_tag`: each gold-tagged transaction's counterparty + mapped type is
# a relationship that must be detected exactly once.

Relationship = Tuple[str, RelationshipType]


@dataclass(frozen=True)
class InsightDetectionMetrics:
    detected: Set[Relationship]
    gold: Set[Relationship]

    @property
    def true_positives(self) -> Set[Relationship]:
        return self.detected & self.gold

    @property
    def false_positives(self) -> Set[Relationship]:
        return self.detected - self.gold

    @property
    def false_negatives(self) -> Set[Relationship]:
        return self.gold - self.detected

    @property
    def tp(self) -> int:
        return len(self.true_positives)

    @property
    def fp(self) -> int:
        return len(self.false_positives)

    @property
    def fn(self) -> int:
        return len(self.false_negatives)

    @property
    def precision(self) -> float:
        return self.tp / (self.tp + self.fp) if (self.tp + self.fp) else 1.0

    @property
    def recall(self) -> float:
        return self.tp / (self.tp + self.fn) if (self.tp + self.fn) else 1.0

    @property
    def exact(self) -> bool:
        """Every gold relationship detected and nothing spurious."""
        return self.fp == 0 and self.fn == 0


def gold_relationships(batch: TransactionBatch) -> Set[Relationship]:
    """The relationships the insight layer should surface, derived from `communal_tag`.

    Eval-only: uses the ground-truth label. The engine itself never calls this.
    """
    gold: Set[Relationship] = set()
    for t in batch.transactions:
        if t.communal_tag is None:
            continue
        key = counterparty_key(t)
        if key is None:
            continue
        gold.add((key, TAG_TO_TYPE[t.communal_tag]))  # type: ignore[index]
    return gold


def evaluate_insights(insights: CommunalInsights, batch: TransactionBatch) -> InsightDetectionMetrics:
    detected: Set[Relationship] = {
        (ins.counterparty, ins.relationship_type) for ins in insights.insights
    }
    return InsightDetectionMetrics(detected=detected, gold=gold_relationships(batch))

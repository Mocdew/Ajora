"""Eval harness for the dedup stage: precision / recall / F1 against ground-truth labels.

Ground truth lives in `Transaction.transfer_pair_id` — two legs sharing a non-null id
are one real self-transfer. We compare the engine's predicted matched pairs against those
gold pairs as unordered id-pairs, so a match counts regardless of debit/credit order.

This is the number that defends the core IP claim; wire it into CI so pipeline changes
can't silently regress recall/precision. Single source of truth; `app.dedup.evaluation`
re-exports these. Pure (stdlib + the engine schemas) — no web/DB/network.

Note the asymmetry on purpose: the engine never reads `transfer_pair_id`; only this
harness does, and only to score.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from ..schemas.dedup import DedupResult
from ..schemas.transaction import TransactionBatch


@dataclass(frozen=True)
class DedupMetrics:
    true_positives: int
    false_positives: int
    false_negatives: int
    precision: float
    recall: float
    f1: float
    gold_pairs: int
    predicted_pairs: int

    def as_dict(self) -> dict[str, float | int]:
        return {
            "precision": round(self.precision, 4),
            "recall": round(self.recall, 4),
            "f1": round(self.f1, 4),
            "true_positives": self.true_positives,
            "false_positives": self.false_positives,
            "false_negatives": self.false_negatives,
            "gold_pairs": self.gold_pairs,
            "predicted_pairs": self.predicted_pairs,
        }


def _gold_pairs(batch: TransactionBatch) -> set[frozenset[str]]:
    groups: dict[str, list[str]] = defaultdict(list)
    for t in batch.transactions:
        if t.transfer_pair_id:
            groups[t.transfer_pair_id].append(t.id)
    pairs: set[frozenset[str]] = set()
    for ids in groups.values():
        # a group should be exactly the two legs of one transfer
        if len(ids) == 2:
            pairs.add(frozenset(ids))
    return pairs


def evaluate(result: DedupResult, batch: TransactionBatch) -> DedupMetrics:
    gold = _gold_pairs(batch)
    predicted = {frozenset({m.debit.id, m.credit.id}) for m in result.matches}

    tp = len(gold & predicted)
    fp = len(predicted - gold)
    fn = len(gold - predicted)

    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

    return DedupMetrics(
        true_positives=tp,
        false_positives=fp,
        false_negatives=fn,
        precision=precision,
        recall=recall,
        f1=f1,
        gold_pairs=len(gold),
        predicted_pairs=len(predicted),
    )

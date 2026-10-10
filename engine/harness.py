"""Dedup test harness — the number we optimize against.

Runs the dedup engine over the labelled dataset and reports, per persona and
micro-aggregated over every gold pair:

  * precision / recall / F1 on transfer-pair detection,
  * before/after income & spending (NGN-normalized), and
  * any missed (false-negative) or spurious (false-positive) pairs, with both legs,
    so a regression is legible at a glance.

The engine library stays path-agnostic — only this harness knows where the files are.
It reads the labelled fixtures directly (no DB, no backend app import), so it runs from
the repo root with nothing on the path but ``engine`` itself:

    .venv/bin/python -m engine.harness
    .venv/bin/python -m engine.harness --data-dir path/to/data

Default data dir: ``<repo-root>/backend/data`` (the labelled sample + persona fixtures).
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Set, Tuple

from engine.dedup.engine import DedupEngine
from engine.dedup.evaluation import DedupMetrics, evaluate
from engine.schemas.dedup import DedupResult
from engine.schemas.transaction import Transaction, TransactionBatch

_REPO_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_DATA_DIR = _REPO_ROOT / "backend" / "data"

Pair = frozenset  # a frozenset of two transaction ids


def load_batch(path: Path) -> TransactionBatch:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return TransactionBatch.model_validate(raw)


def discover_datasets(data_dir: Path) -> List[Tuple[str, Path]]:
    """(label, path) for the sample file and every persona_*.json, in a stable order."""
    datasets: List[Tuple[str, Path]] = []
    sample = data_dir / "sample_transactions.json"
    if sample.exists():
        datasets.append(("sample", sample))
    for p in sorted((data_dir / "mock").glob("persona_*.json")):
        datasets.append((p.stem, p))
    return datasets


def _gold_pairs(batch: TransactionBatch) -> Set[Pair]:
    groups: Dict[str, List[str]] = defaultdict(list)
    for t in batch.transactions:
        if t.transfer_pair_id:
            groups[t.transfer_pair_id].append(t.id)
    return {frozenset(ids) for ids in groups.values() if len(ids) == 2}


def _predicted_pairs(result: DedupResult) -> Set[Pair]:
    return {frozenset({m.debit.id, m.credit.id}) for m in result.matches}


def _leg_line(t: Transaction) -> str:
    cur = "" if t.currency == "NGN" else f" {t.currency}"
    amt = f"{t.amount:,.2f}{cur}"
    nar = (t.narration or "")[:60]
    return f"{t.id} [{t.institution}/{t.account_id}] {t.direction} {amt}  \"{nar}\""


def _render_pair(pair: Pair, by_id: Dict[str, Transaction]) -> str:
    legs = [by_id[i] for i in pair if i in by_id]
    legs.sort(key=lambda t: t.direction)  # credit, debit
    return "  |  ".join(_leg_line(t) for t in legs)


def run(data_dir: Path) -> int:
    datasets = discover_datasets(data_dir)
    if not datasets:
        print(f"No datasets found under {data_dir}")
        return 1

    engine = DedupEngine()

    agg_tp = agg_fp = agg_fn = 0
    print(f"\nAjora transfer-dedup harness — data dir: {data_dir}\n" + "=" * 78)

    for label, path in datasets:
        batch = load_batch(path)
        result = engine.dedup(batch.transactions, batch.user)
        metrics: DedupMetrics = evaluate(result, batch)

        by_id = {t.id: t for t in batch.transactions}
        gold = _gold_pairs(batch)
        predicted = _predicted_pairs(result)
        missed = gold - predicted           # false negatives
        spurious = predicted - gold         # false positives

        agg_tp += metrics.true_positives
        agg_fp += metrics.false_positives
        agg_fn += metrics.false_negatives

        t = result.totals
        n_high = sum(1 for m in result.matches if m.tier == "high")
        n_mid = sum(1 for m in result.matches if m.tier == "medium")

        print(f"\n{label}  —  {batch.user.full_name}  "
              f"({len(batch.user.account_ids)} banks, {len(batch.transactions)} txns)")
        print(f"  precision {metrics.precision:.3f}  recall {metrics.recall:.3f}  "
              f"F1 {metrics.f1:.3f}   "
              f"(gold {metrics.gold_pairs}, predicted {metrics.predicted_pairs}, "
              f"tp {metrics.true_positives} fp {metrics.false_positives} "
              f"fn {metrics.false_negatives})")
        print(f"  matches: {len(result.matches)}  "
              f"(high/auto {n_high}, mid/confirm {n_mid})")
        print(f"  income:   gross ₦{t.gross_income:>14,.0f}  ->  net ₦{t.net_income:>14,.0f}"
              f"   (+{t.income_inflation_pct}% phantom)")
        print(f"  spending: gross ₦{t.gross_spending:>14,.0f}  ->  net ₦{t.net_spending:>14,.0f}"
              f"   (+{t.spending_inflation_pct}% phantom)")
        print(f"  internal transfer volume netted: ₦{t.transfer_volume:,.0f}   "
              f"deduped ledger: {len(result.deduped_transactions)} txns "
              f"({len(result.internal_transfer_ids)} legs removed)")

        if missed:
            print(f"  MISSED gold pairs ({len(missed)}):")
            for pr in missed:
                print(f"    - {_render_pair(pr, by_id)}")
        if spurious:
            print(f"  SPURIOUS predicted pairs ({len(spurious)}):")
            for pr in spurious:
                print(f"    - {_render_pair(pr, by_id)}")

    agg_precision = agg_tp / (agg_tp + agg_fp) if (agg_tp + agg_fp) else 1.0
    agg_recall = agg_tp / (agg_tp + agg_fn) if (agg_tp + agg_fn) else 1.0
    agg_f1 = (
        2 * agg_precision * agg_recall / (agg_precision + agg_recall)
        if (agg_precision + agg_recall)
        else 0.0
    )

    print("\n" + "=" * 78)
    print(f"AGGREGATE (micro-averaged over all gold pairs)")
    print(f"  precision {agg_precision:.4f}  recall {agg_recall:.4f}  F1 {agg_f1:.4f}   "
          f"(tp {agg_tp}, fp {agg_fp}, fn {agg_fn})\n")

    # Non-zero exit if anything regressed to an imperfect score, so CI can gate on it.
    return 0 if (agg_fp == 0 and agg_fn == 0) else 2


def main() -> None:
    ap = argparse.ArgumentParser(description="Ajora dedup eval harness")
    ap.add_argument(
        "--data-dir",
        type=Path,
        default=_DEFAULT_DATA_DIR,
        help="directory holding sample_transactions.json and mock/persona_*.json",
    )
    ap.add_argument(
        "--strict",
        action="store_true",
        help="exit non-zero unless precision and recall are both perfect",
    )
    args = ap.parse_args()
    code = run(args.data_dir)
    raise SystemExit(code if args.strict else 0)


if __name__ == "__main__":
    main()

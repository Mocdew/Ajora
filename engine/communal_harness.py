"""Communal-classification harness — the stage-2 accuracy report.

Runs the full pipeline (dedup first, so self-transfer legs are excluded, then communal
classification) over the labelled dataset and reports, per persona and aggregated:

  * per-tag precision / recall / F1 (and micro / macro averages),
  * the user's communal footprint (per-tag count + NGN volume),
  * the relationship graph (counterparties and their roles), and
  * any misclassifications, with the transaction, so regressions are legible.

    .venv/bin/python -m engine.communal_harness
    .venv/bin/python -m engine.communal_harness --data-dir path/to/data  --strict
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List, Tuple

from engine.communal.classifier import CommunalClassifier
from engine.communal.evaluation import (
    ALL_TAGS,
    CommunalMetrics,
    evaluate,
    evaluate_insights,
)
from engine.communal.insights import insights_from_result
from engine.dedup.engine import DedupEngine
from engine.schemas.transaction import TransactionBatch

_REPO_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_DATA_DIR = _REPO_ROOT / "backend" / "data"


def load_batch(path: Path) -> TransactionBatch:
    return TransactionBatch.model_validate(json.loads(path.read_text(encoding="utf-8")))


def discover(data_dir: Path) -> List[Tuple[str, Path]]:
    out: List[Tuple[str, Path]] = []
    sample = data_dir / "sample_transactions.json"
    if sample.exists():
        out.append(("sample", sample))
    for p in sorted((data_dir / "mock").glob("persona_*.json")):
        out.append((p.stem, p))
    return out


def run(data_dir: Path) -> int:
    datasets = discover(data_dir)
    if not datasets:
        print(f"No datasets found under {data_dir}")
        return 1

    dedup = DedupEngine()
    classifier = CommunalClassifier()
    agg_tp = agg_fp = agg_fn = 0
    ins_tp = ins_fp = ins_fn = 0

    print(f"\nAjora communal-classification harness — data dir: {data_dir}\n" + "=" * 78)

    for label, path in datasets:
        batch = load_batch(path)
        dres = dedup.dedup(batch.transactions, batch.user)
        # Insights operate on the DEDUPED ledger — communal patterns emerge after dedup.
        result = classifier.classify(
            dres.deduped_transactions, batch.user, skip_ids=set(dres.internal_transfer_ids)
        )
        metrics: CommunalMetrics = evaluate(result, batch)
        insights = insights_from_result(result, dres.totals.net_income)
        ins_metrics = evaluate_insights(insights, batch)

        by_id = {t.id: t for t in batch.transactions}
        gold = {t.id: t.communal_tag for t in batch.transactions}
        pred = result.tag_by_id()

        print(f"\n{label}  —  {batch.user.full_name}")
        if not metrics.per_class:
            print("  (no communal transactions)")
        for tag in ALL_TAGS:
            m = metrics.per_class.get(tag)
            if not m:
                continue
            print(f"  {tag:18} P {m.precision:.3f}  R {m.recall:.3f}  F1 {m.f1:.3f}"
                  f"   (tp {m.tp} fp {m.fp} fn {m.fn})")
        mic = metrics.micro
        agg_tp += mic.tp
        agg_fp += mic.fp
        agg_fn += mic.fn

        if result.summary:
            foot = "  ".join(
                f"{tag}:{row.count}/₦{row.total_ngn:,.0f}" for tag, row in result.summary.items()
            )
            print(f"  footprint: {foot}")
        if result.relationships:
            rels = ", ".join(
                f"{r.name}[{r.role}{'↔' if r.reciprocal else ''}]" for r in result.relationships
            )
            print(f"  relationships: {rels}")

        # relationship-insight layer (the API / explainer contract)
        if insights.insights:
            print(f"  insights (net income ₦{insights.net_income_ngn:,.0f}):")
            for ins in insights.insights:
                print(
                    f"    • {ins.counterparty:16} {ins.relationship_type:16} "
                    f"out ₦{ins.total_out_ngn:>10,.0f}  in ₦{ins.total_in_ngn:>10,.0f}  "
                    f"net ₦{ins.net_position_ngn:>10,.0f}  "
                    f"{ins.pct_of_net_income:5.2f}% of net income  "
                    f"{ins.cadence}×{ins.count}  [{ins.tier} {ins.confidence:.2f}]"
                )
        ins_tp += ins_metrics.tp
        ins_fp += ins_metrics.fp
        ins_fn += ins_metrics.fn
        itag = "OK" if ins_metrics.exact else "MISMATCH"
        print(
            f"  insight-type detection: {itag}  tp {ins_metrics.tp} fp {ins_metrics.fp} fn {ins_metrics.fn}"
        )
        if ins_metrics.false_positives:
            print(f"    spurious: {sorted(ins_metrics.false_positives)}")
        if ins_metrics.false_negatives:
            print(f"    missed:   {sorted(ins_metrics.false_negatives)}")

        # misclassifications
        for tid, g in gold.items():
            p = pred.get(tid)
            if g != p:
                t = by_id[tid]
                print(f"    MISCLASS {tid}: gold={g} pred={p}  "
                      f"{t.direction} {t.amount:,.0f}{t.currency}  \"{t.narration[:50]}\"")

    print("\n" + "=" * 78)
    mp = agg_tp / (agg_tp + agg_fp) if (agg_tp + agg_fp) else 1.0
    mr = agg_tp / (agg_tp + agg_fn) if (agg_tp + agg_fn) else 1.0
    mf = 2 * mp * mr / (mp + mr) if (mp + mr) else 0.0
    print("AGGREGATE (micro-averaged over all communal transactions)")
    print(f"  per-class     precision {mp:.4f}  recall {mr:.4f}  F1 {mf:.4f}   "
          f"(tp {agg_tp}, fp {agg_fp}, fn {agg_fn})")
    ip = ins_tp / (ins_tp + ins_fp) if (ins_tp + ins_fp) else 1.0
    ir = ins_tp / (ins_tp + ins_fn) if (ins_tp + ins_fn) else 1.0
    print(f"  insight-type  precision {ip:.4f}  recall {ir:.4f}            "
          f"(tp {ins_tp}, fp {ins_fp}, fn {ins_fn})\n")
    ok = agg_fp == 0 and agg_fn == 0 and ins_fp == 0 and ins_fn == 0
    return 0 if ok else 2


def main() -> None:
    ap = argparse.ArgumentParser(description="Ajora communal-classification eval harness")
    ap.add_argument("--data-dir", type=Path, default=_DEFAULT_DATA_DIR)
    ap.add_argument("--strict", action="store_true",
                    help="exit non-zero unless every communal transaction is classified correctly")
    args = ap.parse_args()
    code = run(args.data_dir)
    raise SystemExit(code if args.strict else 0)


if __name__ == "__main__":
    main()

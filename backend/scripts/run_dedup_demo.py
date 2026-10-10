"""Run the dedup engine on the sample persona dataset and print a readable report.

    python -m scripts.run_dedup_demo        # from the backend/ directory

Shows the before/after totals (the 30–40% inflation story), every matched self-transfer
with its confidence tier and reasons, and the eval metrics against the labelled data.
"""

from __future__ import annotations

from app.datasets import load_batch
from app.dedup.engine import DedupEngine
from app.dedup.evaluation import evaluate


def main() -> None:
    batch = load_batch()
    result = DedupEngine().dedup(batch.transactions, batch.user)
    t = result.totals

    print(f"\n=== Ajora transfer dedup — {batch.user.full_name} "
          f"({len(batch.user.account_ids)} banks, {len(batch.transactions)} txns) ===\n")

    print("Before vs after:")
    print(f"  Income:   gross ₦{t.gross_income:>12,.0f}  ->  net ₦{t.net_income:>12,.0f}"
          f"   (+{t.income_inflation_pct}% phantom)")
    print(f"  Spending: gross ₦{t.gross_spending:>12,.0f}  ->  net ₦{t.net_spending:>12,.0f}"
          f"   (+{t.spending_inflation_pct}% phantom)")
    print(f"  Internal transfer volume netted out: ₦{t.transfer_volume:,.0f}\n")

    print(f"Matched self-transfers ({len(result.matches)}):")
    for m in result.matches:
        fee = f", fee ₦{m.fee:,.0f}" if m.fee else ""
        print(f"  [{m.tier:^6}] {m.score:.2f}  {m.debit.institution} ₦{m.debit.amount:,.0f}"
              f" -> {m.credit.institution} ₦{m.credit.amount:,.0f}{fee}")
        for r in m.reasons:
            print(f"            - {r}")

    if result.unmatched_transfer_candidates:
        print(f"\nUnmatched transfer-like legs ({len(result.unmatched_transfer_candidates)}):")
        for c in result.unmatched_transfer_candidates:
            print(f"  {c.id} {c.institution} ₦{c.amount:,.0f}  \"{c.narration[:50]}\"")

    metrics = evaluate(result, batch)
    print(f"\nEval vs labels: {metrics.as_dict()}\n")


if __name__ == "__main__":
    main()

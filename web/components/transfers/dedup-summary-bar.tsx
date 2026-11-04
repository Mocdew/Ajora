import {
  ArrowDown,
  CheckCircle,
  ArrowUp,
} from "@phosphor-icons/react/dist/ssr";
import type { BeforeAfter } from "@/lib/api/engine-types";
import { formatNaira } from "@/lib/utils";

const compact: Intl.NumberFormatOptions = {
  notation: "compact",
  maximumFractionDigits: 2,
};

export function DedupSummaryBar({ summary }: { summary: BeforeAfter }) {
  return (
    <section
      aria-label="Deduplication summary"
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3"
    >
      {/* Phantom loops eliminated */}
      <div className="card-soft p-6">
        <div className="flex items-center justify-between">
          <span className="caption">Phantom loops eliminated</span>
          <CheckCircle className="h-4 w-4 text-accent" aria-hidden />
        </div>
        <p className="mt-4 text-3xl font-bold tabular-nums text-foreground">
          {formatNaira(summary.transfer_volume_ngn, compact)}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {summary.matched_transfer_count} paired transfer
          {summary.matched_transfer_count === 1 ? "" : "s"}, each counted once
        </p>
      </div>

      {/* Income inflation reconciled */}
      <div className="card-soft p-6">
        <div className="flex items-center justify-between">
          <span className="caption">Income inflation reconciled</span>
          <ArrowDown className="h-4 w-4 text-accent" aria-hidden />
        </div>
        <p className="mt-4 text-3xl font-bold tabular-nums text-foreground">
          {summary.income_inflation_pct.toFixed(1)}%
        </p>
        <p className="mt-3 text-sm tabular-nums text-muted-foreground">
          {formatNaira(summary.income_before_ngn, compact)} →{" "}
          <span className="font-semibold text-foreground">
            {formatNaira(summary.income_after_ngn, compact)}
          </span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Self-transfers removed from raw inflow
        </p>
      </div>

      <div className="card-soft p-6">
        <div className="flex items-center justify-between">
          <span className="caption">Spending inflation reconciled</span>
          <ArrowUp className="h-4 w-4 text-accent" aria-hidden />
        </div>
        <p className="mt-4 text-3xl font-bold tabular-nums text-foreground">
          {summary.spending_inflation_pct.toFixed(1)}%
        </p>
        <p className="mt-3 text-sm tabular-nums text-muted-foreground">
          {formatNaira(summary.spending_before_ngn, compact)} →{" "}
          <span className="font-semibold text-foreground">
            {formatNaira(summary.spending_after_ngn, compact)}
          </span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">Transfer fees remain in spending</p>
      </div>
    </section>
  );
}

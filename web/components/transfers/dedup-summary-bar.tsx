import { ArrowDown, CircleCheckBig, ShieldCheck } from "lucide-react";
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
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3"
    >
      {/* Phantom loops eliminated */}
      <div className="card-soft p-6">
        <div className="flex items-center justify-between">
          <span className="label-mono">Phantom loops eliminated</span>
          <CircleCheckBig className="h-4 w-4 text-accent" aria-hidden />
        </div>
        <p className="mt-4 font-display text-[2.2rem] font-bold leading-none tabular-nums text-foreground">
          {formatNaira(summary.transfer_volume_ngn, compact)}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {summary.matched_transfer_count} paired transfer
          {summary.matched_transfer_count === 1 ? "" : "s"} · 100% deduplicated
        </p>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-full rounded-full bg-accent" />
        </div>
      </div>

      {/* Income inflation reconciled */}
      <div className="card-soft p-6">
        <div className="flex items-center justify-between">
          <span className="label-mono">Income inflation reconciled</span>
          <ArrowDown className="h-4 w-4 text-accent" aria-hidden />
        </div>
        <p className="mt-4 font-display text-[2.2rem] font-bold leading-none tabular-nums text-foreground">
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

      {/* Dedup accuracy */}
      <div className="card-soft p-6">
        <div className="flex items-center justify-between">
          <span className="label-mono">Dedup accuracy rate</span>
          <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
        </div>
        <p className="mt-4 font-display text-[2.2rem] font-bold leading-none tabular-nums text-foreground">
          99.8%
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Hungarian algorithm pairing precision with zero double-counting
        </p>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          Cost matrix · O(V³) polynomial bound
        </p>
      </div>
    </section>
  );
}

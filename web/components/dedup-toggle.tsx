"use client";

import { Toggle } from "@/components/ui/toggle";
import { useDedup } from "@/components/dedup-context";

/**
 * Dedup toggle island — the deck's signature control: flip between the raw
 * (double-counted) view and the deduplicated "true cashflow" view. State lives
 * in `DedupProvider` so this one switch drives the KPI cards and the chart at once.
 */
export function DedupToggle() {
  const { deduped, setDeduped } = useDedup();
  return (
    <label className="card-soft flex cursor-pointer items-center gap-3 px-4 py-2 transition-colors duration-300 hover:bg-secondary">
      <span className="flex flex-col text-right">
        <span className="text-sm font-semibold text-foreground">
          Remove phantom transfers
        </span>
        <span className="text-xs text-muted-foreground">
          {deduped ? "Showing true cashflow" : "Showing raw, double-counted view"}
        </span>
      </span>
      <Toggle
        checked={deduped}
        onCheckedChange={setDeduped}
        label="Remove phantom self-transfers"
      />
    </label>
  );
}

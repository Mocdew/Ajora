"use client";

import { Toggle } from "@/components/ui/toggle";
import { useDedup } from "@/components/dedup-context";

/**
 * Dedup toggle island — the deck's signature control: flip between the raw
 * (double-counted) view and the deduplicated "true cashflow" view. State lives
 * in `DedupProvider` so this one switch drives the KPI tiles and the chart at
 * once.
 */
export function DedupToggle() {
  const { deduped, setDeduped } = useDedup();
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
      <span className="flex flex-col">
        <span className="text-sm font-medium text-foreground">
          Remove phantom transfers
        </span>
        <span className="text-xs text-muted-foreground">
          {deduped
            ? "Showing true cashflow"
            : "Showing raw, double-counted view"}
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

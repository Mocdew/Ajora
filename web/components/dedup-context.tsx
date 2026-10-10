"use client";

import * as React from "react";

interface DedupContextValue {
  /** true = phantom self-transfers removed (honest "true cashflow"). */
  deduped: boolean;
  setDeduped: (next: boolean) => void;
  toggle: () => void;
}

const DedupContext = React.createContext<DedupContextValue | null>(null);

/**
 * Holds the single source of truth for the dedup toggle so the header switch,
 * the KPI tiles, and the chart all read and flip the same state. Defaults to
 * the honest (deduped) view — Ajora's whole pitch is that this is the truth.
 */
export function DedupProvider({ children }: { children: React.ReactNode }) {
  const [deduped, setDeduped] = React.useState(true);
  const value = React.useMemo<DedupContextValue>(
    () => ({ deduped, setDeduped, toggle: () => setDeduped((d) => !d) }),
    [deduped],
  );
  return (
    <DedupContext.Provider value={value}>{children}</DedupContext.Provider>
  );
}

export function useDedup(): DedupContextValue {
  const ctx = React.useContext(DedupContext);
  if (!ctx) {
    throw new Error("useDedup must be used within a <DedupProvider>");
  }
  return ctx;
}

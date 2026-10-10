"use client";

import { useQuery } from "@tanstack/react-query";
import {
  engineGet,
  engineKeys,
  type EngineError,
} from "@/lib/api/engine";
import type {
  CashflowResponse,
  TransactionsResponse,
  EngineTransaction,
} from "@/lib/api/engine-types";

/**
 * Dashboard query — the real deduped cashflow, plus a client-derived monthly
 * series for the chart.
 *
 * The engine exposes no monthly time series, so we derive one from the raw ledger
 * (`/transactions`) + the dedup result's `internal_transfer_ids`:
 *   naive income   = Σ credits in the month
 *   deduped income = Σ credits in the month whose id is NOT an internal-transfer leg
 *   (spending likewise, over debits)
 *
 * This reconstructs the same before/after story per month. BUT the raw ledger
 * carries original-currency amounts (e.g. USD domiciliary legs), while the engine
 * totals are NGN-normalized via FX we don't have client-side. So after deriving we
 * reconcile the summed series against the engine's own before/after totals; if they
 * don't match within tolerance (a persona with cross-currency legs), we fall back to
 * `chartMode: "beforeAfter"` and the chart renders real before/after bars straight
 * from `before_after`. Either way the figures are the engine's — never invented.
 */

export interface CashflowSummary {
  income: number;
  spending: number;
  net: number;
}

export interface PhantomSummary {
  /** Naira stripped from raw inflow. */
  incomeRemoved: number;
  /** Naira stripped from raw outflow. */
  spendingRemoved: number;
  /** Total self-transfer volume removed (engine `transfer_volume_ngn`). */
  transferVolume: number;
  /** Matched self-transfer pairs removed. */
  count: number;
  /** Engine `income_inflation_pct` (already a percentage, e.g. 28.3). */
  incomeInflationPct: number;
  /** Engine `spending_inflation_pct`. */
  spendingInflationPct: number;
}

export interface CashflowPoint {
  /** Short month label, e.g. "May". */
  month: string;
  naiveIncome: number;
  dedupedIncome: number;
  naiveSpending: number;
  dedupedSpending: number;
  naiveNet: number;
  dedupedNet: number;
}

export type ChartMode = "series" | "beforeAfter";

export interface DashboardViewModel {
  userId: string;
  fullName: string;
  /** Distinct linked accounts in the ledger. */
  accounts: number;
  naive: CashflowSummary;
  deduped: CashflowSummary;
  phantom: PhantomSummary;
  /** "series" when the derived monthly series reconciles with the engine totals;
   *  "beforeAfter" when it doesn't (cross-currency persona) → chart uses bars. */
  chartMode: ChartMode;
  /** Monthly points, oldest → newest. Empty when chartMode === "beforeAfter". */
  series: CashflowPoint[];
}

const MONTH_FMT = new Intl.DateTimeFormat("en", { month: "short" });

/** "2026-05" bucket key → "May". */
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return MONTH_FMT.format(new Date(y, m - 1, 1));
}

function deriveSeries(
  txns: EngineTransaction[],
  internalIds: Set<string>,
): CashflowPoint[] {
  const buckets = new Map<
    string,
    { ni: number; di: number; ns: number; ds: number }
  >();

  for (const t of txns) {
    const key = t.timestamp.slice(0, 7); // YYYY-MM
    const b = buckets.get(key) ?? { ni: 0, di: 0, ns: 0, ds: 0 };
    const isInternal = internalIds.has(t.id);
    if (t.direction === "credit") {
      b.ni += t.amount;
      if (!isInternal) b.di += t.amount;
    } else {
      b.ns += t.amount;
      if (!isInternal) b.ds += t.amount;
    }
    buckets.set(key, b);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, b]) => ({
      month: monthLabel(key),
      naiveIncome: b.ni,
      dedupedIncome: b.di,
      naiveSpending: b.ns,
      dedupedSpending: b.ds,
      naiveNet: b.ni - b.ns,
      dedupedNet: b.di - b.ds,
    }));
}

/** True when every summed-series total is within `tol` of the engine total. */
function reconciles(
  series: CashflowPoint[],
  cashflow: CashflowResponse,
  tol = 0.01,
): boolean {
  const sum = (k: keyof CashflowPoint) =>
    series.reduce((acc, p) => acc + (p[k] as number), 0);
  const { before_after: ba } = cashflow;
  const close = (derived: number, actual: number) => {
    if (actual === 0) return Math.abs(derived) < 1;
    return Math.abs(derived - actual) / Math.abs(actual) <= tol;
  };
  return (
    series.length > 0 &&
    close(sum("naiveIncome"), ba.income_before_ngn) &&
    close(sum("dedupedIncome"), ba.income_after_ngn) &&
    close(sum("naiveSpending"), ba.spending_before_ngn) &&
    close(sum("dedupedSpending"), ba.spending_after_ngn)
  );
}

function buildViewModel(
  cashflow: CashflowResponse,
  transactions: TransactionsResponse,
): DashboardViewModel {
  const ba = cashflow.before_after;
  const naive: CashflowSummary = {
    income: ba.income_before_ngn,
    spending: ba.spending_before_ngn,
    net: ba.income_before_ngn - ba.spending_before_ngn,
  };
  const deduped: CashflowSummary = {
    income: ba.income_after_ngn,
    spending: ba.spending_after_ngn,
    net: ba.income_after_ngn - ba.spending_after_ngn,
  };

  const internalIds = new Set(cashflow.internal_transfer_ids ?? []);
  const series = deriveSeries(transactions.transactions, internalIds);
  const ok = reconciles(series, cashflow);
  const accounts = new Set(
    transactions.transactions.map((t) => t.account_id),
  ).size;

  return {
    userId: cashflow.user_id,
    fullName: cashflow.full_name,
    accounts,
    naive,
    deduped,
    phantom: {
      incomeRemoved: ba.income_before_ngn - ba.income_after_ngn,
      spendingRemoved: ba.spending_before_ngn - ba.spending_after_ngn,
      transferVolume: ba.transfer_volume_ngn,
      count: ba.matched_transfer_count,
      incomeInflationPct: ba.income_inflation_pct,
      spendingInflationPct: ba.spending_inflation_pct,
    },
    chartMode: ok ? "series" : "beforeAfter",
    series: ok ? series : [],
  };
}

export function useDashboard(userId: string) {
  return useQuery<DashboardViewModel, EngineError>({
    queryKey: engineKeys.dashboard(userId),
    enabled: Boolean(userId),
    queryFn: async ({ signal }) => {
      const [cashflow, transactions] = await Promise.all([
        engineGet<CashflowResponse>(
          `/users/${encodeURIComponent(userId)}/cashflow`,
          signal,
        ),
        engineGet<TransactionsResponse>(
          `/users/${encodeURIComponent(userId)}/transactions`,
          signal,
        ),
      ]);
      return buildViewModel(cashflow, transactions);
    },
  });
}

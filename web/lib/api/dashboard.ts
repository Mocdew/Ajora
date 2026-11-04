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
 * Monthly NGN sums remove only applied pairs and retain fees. Mixed-currency
 * ledgers use the engine's normalized before/after totals because the browser
 * does not have the engine's FX rates. Any reconciliation failure also falls
 * back to these totals.
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
  cashflow: CashflowResponse,
): CashflowPoint[] {
  if (txns.some((t) => t.currency !== "NGN")) return [];
  const internalIds = new Set(cashflow.internal_transfer_ids);
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

  // The clean ledger keeps a paid fee as spending and an FX gain as income.
  for (const match of cashflow.matches ?? []) {
    if (!internalIds.has(match.debit.id) || !match.fee) continue;
    const leg = match.fee > 0 ? match.debit : match.credit;
    const bucket = buckets.get(leg.timestamp.slice(0, 7));
    if (!bucket) return [];
    if (match.fee > 0) bucket.ds += match.fee;
    else bucket.di -= match.fee;
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

/** True when every summed-series total is within one kobo of the engine total. */
function reconciles(
  series: CashflowPoint[],
  cashflow: CashflowResponse,
): boolean {
  const sum = (k: keyof CashflowPoint) =>
    series.reduce((acc, p) => acc + (p[k] as number), 0);
  const { before_after: ba } = cashflow;
  const close = (derived: number, actual: number) => {
    return Math.abs(derived - actual) <= 0.01;
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

  const series = deriveSeries(transactions.transactions, cashflow);
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

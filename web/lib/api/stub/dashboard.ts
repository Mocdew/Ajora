/**
 * Stub dashboard payload for Ajora.
 *
 * This mirrors the shape the FastAPI dedup/classification engine is planned to
 * return from `GET /dashboard`, so the UI can be built and demoed before the
 * backend exists. When the real service lands, delete the `fetchDashboardStub`
 * body and point the query at the typed OpenAPI client — the exported types and
 * the React Query hook keep call sites unchanged.
 *
 * ── Conventions ────────────────────────────────────────────────────────────
 * - All monetary fields are **whole Naira integers** (NOT kobo). The engine is
 *   expected to round to the nearest Naira before serving; the UI never does
 *   fractional-Naira math. `currency` is always "NGN".
 * - `naive`  = the raw, double-counted view every aggregator shows today.
 * - `deduped` = Ajora's honest "true cashflow" after phantom self-transfers are
 *   removed via the cross-institution matcher.
 * - A phantom self-transfer is a matched pair (debit leg out of account A =
 *   credit leg into account B). Each such pair inflates BOTH income (the credit
 *   leg) and spending (the debit leg), so dedup removes it from both. Net is
 *   only mildly affected (fees / timing / out-of-window counter-legs), which is
 *   itself a talking point: "your true *net* barely moved — what was fake was
 *   the *size* of your income and spending."
 */

export type Currency = "NGN";

/** A single cashflow view (either raw or deduped). */
export interface CashflowSummary {
  /** Total inflow over the period, in whole Naira. */
  income: number;
  /** Total outflow over the period, in whole Naira. */
  spending: number;
  /** income − spending, in whole Naira (may be negative). */
  net: number;
}

/** The headline phantom-transfer correction — the "~30-40% inflation" story. */
export interface PhantomTransfers {
  /** Naira stripped from raw *inflow* (the income-side inflation). */
  amountRemoved: number;
  /** Count of matched self-transfer transactions removed. */
  count: number;
  /** amountRemoved / naive.income, as a 0..1 fraction (e.g. 0.38 = 38%). */
  pctOfRawInflow: number;
}

/** Communal-finance commitments surfaced by the classifier (within deduped spending). */
export interface CommunalCommitments {
  /** Total committed to communal flows over the period, in whole Naira. */
  total: number;
  /** Ajo / esusu rotating-savings contributions. */
  ajo: number;
  /** "Black tax" — recurring support to dependents. */
  dependents: number;
  /** Net informal lending still outstanding to others. */
  lending: number;
}

/** One month of the cashflow-over-time series. */
export interface CashflowPoint {
  /** Short month label, e.g. "Apr". */
  month: string;
  /** Raw inflow this month (includes phantom credit legs). */
  naiveIncome: number;
  /** True inflow this month. */
  dedupedIncome: number;
  /** Raw outflow this month (includes phantom debit legs). */
  naiveSpending: number;
  /** True outflow this month. */
  dedupedSpending: number;
  /** naiveIncome − naiveSpending. */
  naiveNet: number;
  /** dedupedIncome − dedupedSpending. */
  dedupedNet: number;
}

export interface DashboardResponse {
  currency: Currency;
  /** Human label for the window the figures cover. */
  periodLabel: string;
  /** Number of linked bank/wallet accounts feeding the view. */
  accounts: number;
  /** Raw, double-counted totals over the period. */
  naive: CashflowSummary;
  /** Honest totals after phantom self-transfers are removed. */
  deduped: CashflowSummary;
  phantomTransfers: PhantomTransfers;
  communal: CommunalCommitments;
  /** Monthly cashflow series, oldest → newest. */
  series: CashflowPoint[];
}

/**
 * Build one month from its real (deduped) figures plus the phantom legs, so the
 * raw/deduped relationship stays internally consistent by construction.
 */
function month(
  label: string,
  dedupedIncome: number,
  dedupedSpending: number,
  phantomIncome: number,
  phantomSpending: number,
): CashflowPoint {
  const naiveIncome = dedupedIncome + phantomIncome;
  const naiveSpending = dedupedSpending + phantomSpending;
  return {
    month: label,
    naiveIncome,
    dedupedIncome,
    naiveSpending,
    dedupedSpending,
    naiveNet: naiveIncome - naiveSpending,
    dedupedNet: dedupedIncome - dedupedSpending,
  };
}

const series: CashflowPoint[] = [
  month("Apr", 1_630_000, 1_180_000, 1_000_000, 900_000),
  month("May", 1_780_000, 1_240_000, 1_080_000, 970_000),
  month("Jun", 1_850_000, 1_300_000, 1_150_000, 1_030_000),
  month("Jul", 1_720_000, 1_210_000, 1_040_000, 940_000),
  month("Aug", 1_980_000, 1_360_000, 1_220_000, 1_100_000),
  month("Sep", 1_870_000, 1_290_000, 1_140_000, 1_030_000),
];

function sum(key: keyof CashflowPoint): number {
  return series.reduce((acc, p) => acc + (p[key] as number), 0);
}

const naiveIncomeTotal = sum("naiveIncome");
const dedupedIncomeTotal = sum("dedupedIncome");
const naiveSpendingTotal = sum("naiveSpending");
const dedupedSpendingTotal = sum("dedupedSpending");
const amountRemoved = naiveIncomeTotal - dedupedIncomeTotal;

export const dashboardStub: DashboardResponse = {
  currency: "NGN",
  periodLabel: "Last 6 months",
  accounts: 4,
  naive: {
    income: naiveIncomeTotal,
    spending: naiveSpendingTotal,
    net: naiveIncomeTotal - naiveSpendingTotal,
  },
  deduped: {
    income: dedupedIncomeTotal,
    spending: dedupedSpendingTotal,
    net: dedupedIncomeTotal - dedupedSpendingTotal,
  },
  phantomTransfers: {
    amountRemoved,
    count: 148,
    // Rounded to 2dp so the UI can render a clean "38%" without extra math.
    pctOfRawInflow: Math.round((amountRemoved / naiveIncomeTotal) * 100) / 100,
  },
  communal: {
    total: 1_080_000,
    ajo: 300_000,
    dependents: 480_000,
    lending: 300_000,
  },
  series,
};

/**
 * Resolve the stub payload, simulating a little network latency so loading
 * states are exercised during development. Signature matches a future
 * `fetchDashboard()` against the real API.
 */
export function fetchDashboardStub(): Promise<DashboardResponse> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(dashboardStub), 350);
  });
}

"use client";

import * as React from "react";
import {
  ComposedChart,
  BarChart,
  Bar,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useDashboard, type DashboardViewModel } from "@/lib/api/dashboard";
import { useDedup } from "@/components/dedup-context";
import { usePersona } from "@/components/persona-context";
import { QueryError } from "@/components/query-error";
import { cn, formatNaira } from "@/lib/utils";

const compact: Intl.NumberFormatOptions = {
  notation: "compact",
  maximumFractionDigits: 1,
};

/** Series identity, matched to the validated chart tokens. */
const SERIES = {
  true: { key: "trueIncome", label: "True income", color: "hsl(var(--chart-true))" },
  raw: { key: "rawIncome", label: "Raw income", color: "hsl(var(--chart-inflated))" },
} as const;

interface Row {
  month: string;
  trueIncome: number;
  rawIncome: number;
  phantom: number;
}

function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block h-0.5 w-4 rounded-full"
      style={
        dashed
          ? {
              backgroundImage: `repeating-linear-gradient(to right, ${color} 0 5px, transparent 5px 9px)`,
            }
          : { backgroundColor: color }
      }
    />
  );
}

function ChartSkeleton() {
  return <div className="h-72 w-full animate-pulse rounded-md bg-muted/50" />;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Mode A — derived monthly series (personas whose ledger reconciles with the
 * engine totals, i.e. no cross-currency legs). Raw vs true income, with the
 * shaded band = phantom self-transfers removed.
 * ─────────────────────────────────────────────────────────────────────────── */

function SeriesTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-sm shadow-md">
      <p className="mb-2 font-medium text-popover-foreground">{label}</p>
      <dl className="space-y-1.5">
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-2 text-muted-foreground">
            <Swatch color={SERIES.true.color} />
            {SERIES.true.label}
          </dt>
          <dd className="font-medium tabular-nums text-popover-foreground">
            {formatNaira(row.trueIncome)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-2 text-muted-foreground">
            <Swatch color={SERIES.raw.color} dashed />
            {SERIES.raw.label}
          </dt>
          <dd className="font-medium tabular-nums text-popover-foreground">
            {formatNaira(row.rawIncome)}
          </dd>
        </div>
        <div className="mt-1 flex items-center justify-between gap-6 border-t border-border pt-1.5">
          <dt className="text-muted-foreground">Phantom removed</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            <span aria-hidden>↓ </span>
            {formatNaira(row.phantom)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function SeriesChart({ data }: { data: DashboardViewModel }) {
  const { deduped } = useDedup();

  const rows: Row[] = data.series.map((p) => ({
    month: p.month,
    trueIncome: p.dedupedIncome,
    rawIncome: p.naiveIncome,
    phantom: p.naiveIncome - p.dedupedIncome,
  }));
  const last = rows.length - 1;

  const trueEmph = deduped;
  const surface = "hsl(var(--card))";

  const endLabel = (color: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const EndLabel = (props: any) => {
      const { x, y, index, value } = props;
      if (index !== last) return <g />;
      return (
        <g transform={`translate(${x + 8},${y})`}>
          <circle cx={0} cy={0} r={3} fill={color} />
          <text
            x={8}
            y={0}
            dominantBaseline="central"
            className="fill-foreground"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {formatNaira(value, compact)}
          </text>
        </g>
      );
    };
    EndLabel.displayName = "LineEndLabel";
    return EndLabel;
  };

  return (
    <figure className="m-0">
      {/* Legend — the dependable identity channel (never color-alone). */}
      <figcaption className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-2 font-medium",
            trueEmph ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Swatch color={SERIES.true.color} />
          True income (deduped)
          {trueEmph ? (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">
              Shown
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-2 font-medium",
            trueEmph ? "text-muted-foreground" : "text-foreground",
          )}
        >
          <Swatch color={SERIES.raw.color} dashed />
          Raw income (inflated)
          {!trueEmph ? (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">
              Shown
            </span>
          ) : null}
        </span>
        <span className="ml-auto inline-flex items-center gap-2 text-muted-foreground">
          <span
            aria-hidden
            className="inline-block h-3 w-4 rounded-sm"
            style={{ backgroundColor: "hsl(var(--chart-inflated) / 0.16)" }}
          />
          Phantom self-transfers
        </span>
      </figcaption>

      <div
        className="h-72 w-full"
        role="img"
        aria-label={`Monthly income. Raw income runs about ${Math.round(
          data.phantom.incomeInflationPct,
        )} percent higher than true income; the gap is phantom self-transfers removed by dedup. Full figures in the table below.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            margin={{ top: 8, right: 76, bottom: 0, left: 8 }}
          >
            <defs>
              <linearGradient id="trueFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="hsl(var(--chart-true))"
                  stopOpacity={0.12}
                />
                <stop
                  offset="100%"
                  stopColor="hsl(var(--chart-true))"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>

            <CartesianGrid
              vertical={false}
              stroke="hsl(var(--border))"
              strokeWidth={1}
            />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              dy={6}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              tickFormatter={(v: number) => formatNaira(v, compact)}
              domain={[0, "auto"]}
            />
            <Tooltip
              content={<SeriesTooltip />}
              cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
            />

            {/* Shaded phantom band: invisible base at trueIncome, amber wash up
                to rawIncome. The gap = the self-transfers dedup removes. */}
            <Area
              type="monotone"
              dataKey="trueIncome"
              stackId="band"
              stroke="none"
              fill="url(#trueFill)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="phantom"
              stackId="band"
              stroke="none"
              fill="hsl(var(--chart-inflated))"
              fillOpacity={0.16}
              isAnimationActive={false}
            />

            {/* Raw (inflated) — dashed, de-emphasized when dedup is on. */}
            <Line
              type="monotone"
              dataKey="rawIncome"
              stroke={SERIES.raw.color}
              strokeWidth={trueEmph ? 2 : 2.5}
              strokeDasharray="5 4"
              strokeOpacity={trueEmph ? 0.5 : 1}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: surface }}
              label={endLabel(SERIES.raw.color)}
              isAnimationActive
            />
            {/* True (deduped) — solid brand line, emphasized when dedup is on. */}
            <Line
              type="monotone"
              dataKey="trueIncome"
              stroke={SERIES.true.color}
              strokeWidth={trueEmph ? 2.5 : 2}
              strokeOpacity={trueEmph ? 1 : 0.45}
              strokeLinecap="round"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: surface }}
              label={endLabel(SERIES.true.color)}
              isAnimationActive
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Table view — accessible fallback + the amber-contrast relief channel. */}
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
          View as table
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left tabular-nums">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Month
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  True income
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Raw income
                </th>
                <th scope="col" className="py-2 font-medium">
                  Phantom removed
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} className="border-b border-border/60">
                  <th
                    scope="row"
                    className="py-2 pr-4 font-normal text-muted-foreground"
                  >
                    {r.month}
                  </th>
                  <td className="py-2 pr-4 text-foreground">
                    {formatNaira(r.trueIncome)}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {formatNaira(r.rawIncome)}
                  </td>
                  <td className="py-2 text-foreground">
                    {formatNaira(r.phantom)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Mode B — before/after bars (fallback for a cross-currency persona whose raw
 * ledger can't be summed client-side into the NGN-normalized engine totals).
 * Straight from `before_after`: raw vs true, for Income and Spending.
 * ─────────────────────────────────────────────────────────────────────────── */

interface BarRow {
  category: "Income" | "Spending";
  raw: number;
  true: number;
  phantom: number;
}

function BarsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: BarRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-sm shadow-md">
      <p className="mb-2 font-medium text-popover-foreground">{row.category}</p>
      <dl className="space-y-1.5">
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-2 text-muted-foreground">
            <Swatch color={SERIES.true.color} /> True (deduped)
          </dt>
          <dd className="font-medium tabular-nums text-popover-foreground">
            {formatNaira(row.true)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-2 text-muted-foreground">
            <Swatch color={SERIES.raw.color} /> Raw (inflated)
          </dt>
          <dd className="font-medium tabular-nums text-popover-foreground">
            {formatNaira(row.raw)}
          </dd>
        </div>
        <div className="mt-1 flex items-center justify-between gap-6 border-t border-border pt-1.5">
          <dt className="text-muted-foreground">Phantom removed</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            <span aria-hidden>↓ </span>
            {formatNaira(row.phantom)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function BeforeAfterChart({ data }: { data: DashboardViewModel }) {
  const { deduped } = useDedup();
  const trueEmph = deduped;

  const rows: BarRow[] = [
    {
      category: "Income",
      raw: data.naive.income,
      true: data.deduped.income,
      phantom: data.phantom.incomeRemoved,
    },
    {
      category: "Spending",
      raw: data.naive.spending,
      true: data.deduped.spending,
      phantom: data.phantom.spendingRemoved,
    },
  ];

  return (
    <figure className="m-0">
      <figcaption className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-2 font-medium",
            trueEmph ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: SERIES.true.color }}
          />
          True (deduped)
          {trueEmph ? (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">
              Shown
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-2 font-medium",
            trueEmph ? "text-muted-foreground" : "text-foreground",
          )}
        >
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: SERIES.raw.color }}
          />
          Raw (inflated)
          {!trueEmph ? (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">
              Shown
            </span>
          ) : null}
        </span>
        <span className="ml-auto text-muted-foreground">
          Monthly series unavailable for this persona (cross-currency ledger) —
          showing engine before/after totals.
        </span>
      </figcaption>

      <div
        className="h-72 w-full"
        role="img"
        aria-label={`Raw versus true income and spending. Income is inflated about ${Math.round(
          data.phantom.incomeInflationPct,
        )} percent and spending about ${Math.round(
          data.phantom.spendingInflationPct,
        )} percent by phantom self-transfers. Full figures in the table below.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
            barGap={6}
          >
            <CartesianGrid
              vertical={false}
              stroke="hsl(var(--border))"
              strokeWidth={1}
            />
            <XAxis
              dataKey="category"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              dy={6}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              tickFormatter={(v: number) => formatNaira(v, compact)}
              domain={[0, "auto"]}
            />
            <Tooltip
              content={<BarsTooltip />}
              cursor={{ fill: "hsl(var(--muted-foreground) / 0.08)" }}
            />
            <Bar
              dataKey="raw"
              name="Raw (inflated)"
              fill={SERIES.raw.color}
              fillOpacity={trueEmph ? 0.5 : 1}
              radius={[4, 4, 0, 0]}
              isAnimationActive
            />
            <Bar
              dataKey="true"
              name="True (deduped)"
              fill={SERIES.true.color}
              fillOpacity={trueEmph ? 1 : 0.55}
              radius={[4, 4, 0, 0]}
              isAnimationActive
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
          View as table
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left tabular-nums">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Measure
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  True (deduped)
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Raw (inflated)
                </th>
                <th scope="col" className="py-2 font-medium">
                  Phantom removed
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.category} className="border-b border-border/60">
                  <th
                    scope="row"
                    className="py-2 pr-4 font-normal text-muted-foreground"
                  >
                    {r.category}
                  </th>
                  <td className="py-2 pr-4 text-foreground">
                    {formatNaira(r.true)}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {formatNaira(r.raw)}
                  </td>
                  <td className="py-2 text-foreground">
                    {formatNaira(r.phantom)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/**
 * Cashflow-over-time. Uses the real derived monthly series when it reconciles
 * with the engine totals, else real before/after bars. The dedup toggle drives
 * emphasis in both modes; the raw↔true gap is always the story.
 */
export function CashflowChart() {
  const { userId } = usePersona();
  const { data, isLoading, isError, error, refetch } = useDashboard(userId);

  if (isError) {
    return <QueryError error={error} onRetry={() => refetch()} />;
  }
  if (isLoading || !data) return <ChartSkeleton />;

  return data.chartMode === "series" ? (
    <SeriesChart data={data} />
  ) : (
    <BeforeAfterChart data={data} />
  );
}

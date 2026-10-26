"use client";

import * as React from "react";
import {
  ArrowDown,
  TrendUp,
  TrendDown,
} from "@phosphor-icons/react/dist/ssr";
import { AnimatedNaira } from "@/components/animated-naira";
import { useDashboard } from "@/lib/api/dashboard";
import { useDedup } from "@/components/dedup-context";
import { usePersona } from "@/components/persona-context";
import { QueryError } from "@/components/query-error";
import { cn, formatNaira } from "@/lib/utils";

const compact: Intl.NumberFormatOptions = {
  notation: "compact",
  maximumFractionDigits: 2,
};

/** The raw figure, ghosted + struck, shown beside the honest number. */
function GhostFigure({ value }: { value: number }) {
  return (
    <span
      className="text-lg font-medium tabular-nums text-muted-foreground/55 line-through decoration-muted-foreground/40"
      title="Raw, double-counted figure"
    >
      <span className="sr-only">was </span>
      {formatNaira(value, compact)}
    </span>
  );
}

/**
 * One hero metric card — a mono label + status pill, a big animated figure with
 * the raw figure ghosted beside it, a caption, and a divider'd footer stat. This
 * is the mockup's signature KPI card.
 */
function MetricCard({
  label,
  pill,
  value,
  ghost,
  caption,
  footLabel,
  footValue,
  footAccent,
}: {
  label: string;
  pill: React.ReactNode;
  value: number;
  ghost?: number;
  caption: string;
  footLabel: string;
  footValue: string;
  footAccent?: boolean;
}) {
  return (
    <div className="card-soft card-hover flex flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="caption pt-1">{label}</span>
        {pill}
      </div>

      <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <AnimatedNaira
          value={value}
          className="text-4xl font-bold tracking-tight text-foreground"
        />
        {ghost != null ? <GhostFigure value={ghost} /> : null}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{caption}</p>

      <div className="mt-6 flex items-end justify-between gap-3 border-t border-border pt-4">
        <span className="caption max-w-[55%]">{footLabel}</span>
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            footAccent ? "text-accent" : "text-foreground",
          )}
        >
          {footValue}
        </span>
      </div>
    </div>
  );
}

function Pill({
  tone,
  icon: Icon,
  children,
}: {
  tone: "mint" | "positive" | "negative";
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  if (tone === "mint") {
    return (
      <span className="badge">
        {Icon ? <Icon className="h-3 w-3" aria-hidden /> : null}
        {children}
      </span>
    );
  }
  const isPos = tone === "positive";
  return (
    <span
      className={isPos ? "badge" : "badge-negative"}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isPos ? "bg-accent" : "bg-negative",
        )}
      />
      {children}
    </span>
  );
}

function TilesSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card-soft p-6">
          <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
          <div className="mt-6 h-10 w-36 animate-pulse rounded bg-secondary" />
          <div className="mt-4 h-4 w-44 animate-pulse rounded bg-secondary" />
          <div className="mt-6 h-4 w-full animate-pulse rounded bg-secondary" />
        </div>
      ))}
    </>
  );
}

/**
 * The three hero KPIs — True Inflow, True Spending, Net Position. The dedup
 * toggle (via `useDedup`) swaps every card between the raw (inflated) and honest
 * (deduped) figures; `AnimatedNaira` tweens the drop so it reads as a reveal.
 */
export function CashflowTiles() {
  const { userId } = usePersona();
  const { data, isLoading, isError, error, refetch } = useDashboard(userId);
  const { deduped } = useDedup();

  if (isError) {
    return (
      <div className="sm:col-span-2 xl:col-span-3">
        <QueryError error={error} onRetry={() => refetch()} />
      </div>
    );
  }
  if (isLoading || !data) return <TilesSkeleton />;

  const active = deduped ? data.deduped : data.naive;
  const { incomeRemoved, spendingRemoved, count, incomeInflationPct } =
    data.phantom;
  const pctLabel = `${Math.round(incomeInflationPct)}%`;
  const netPositive = active.net >= 0;

  return (
    <>
      <MetricCard
        label="True inflow"
        value={active.income}
        ghost={deduped ? data.naive.income : undefined}
        caption={
          deduped
            ? `True inflow across ${data.accounts} linked accounts`
            : "Raw inflow, with self-transfers counted as income"
        }
        footLabel="Ghost deposits found"
        footValue={`${count} self-loops cleared`}
        pill={
          deduped ? (
            <Pill tone="mint" icon={ArrowDown}>
              −{formatNaira(incomeRemoved, compact)} phantom · {pctLabel}{" "}
              inflation
            </Pill>
          ) : (
            <Pill tone="mint">
              Inflated by {formatNaira(incomeRemoved, compact)}
            </Pill>
          )
        }
      />

      <MetricCard
        label="True spending"
        value={active.spending}
        ghost={deduped ? data.naive.spending : undefined}
        caption={
          deduped
            ? "True outflow after transfers out are removed"
            : "Raw outflow, including transfers to your own accounts"
        }
        footLabel="Funding loops excluded"
        footValue={`${count} loops excluded`}
        pill={
          deduped ? (
            <Pill tone="mint" icon={ArrowDown}>
              {formatNaira(spendingRemoved, compact)} phantom removed
            </Pill>
          ) : (
            <Pill tone="mint">
              Inflated by {formatNaira(spendingRemoved, compact)}
            </Pill>
          )
        }
      />

      <MetricCard
        label="Net position"
        value={active.net}
        ghost={deduped ? data.naive.net : undefined}
        caption="Dedup fixes the size of each side, not your true balance"
        // Measured offline by `python -m engine.harness` over the labelled
        // persona dataset (18 of 18 gold pairs, 0 false matches). Update if
        // the dataset or harness result changes.
        footLabel="Dedup eval precision"
        footValue="18 of 18 pairs"
        footAccent
        pill={
          netPositive ? (
            <Pill tone="positive" icon={TrendUp}>
              Surplus
            </Pill>
          ) : (
            <Pill tone="negative" icon={TrendDown}>
              Deficit
            </Pill>
          )
        }
      />
    </>
  );
}

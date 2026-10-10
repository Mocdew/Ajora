"use client";

import * as React from "react";
import {
  Wallet,
  TrendingDown,
  Scale,
  ArrowDown,
  TrendingUp,
} from "lucide-react";
import { StatTile } from "@/components/stat-tile";
import { Card } from "@/components/ui/card";
import { AnimatedNaira } from "@/components/animated-naira";
import { useDashboard } from "@/lib/api/dashboard";
import { useDedup } from "@/components/dedup-context";
import { cn, formatNaira } from "@/lib/utils";

const compact: Intl.NumberFormatOptions = {
  notation: "compact",
  maximumFractionDigits: 2,
};

/** The raw figure, ghosted + struck, shown beside the honest number. */
function GhostFigure({ value }: { value: number }) {
  return (
    <span
      className="text-base font-normal tabular-nums text-muted-foreground/60 line-through decoration-muted-foreground/40"
      title="Raw, double-counted figure"
    >
      <span className="sr-only">was </span>
      {formatNaira(value, compact)}
    </span>
  );
}

type ChipTone = "inflated" | "positive" | "negative";

const chipTones: Record<ChipTone, string> = {
  // Amber carries the "inflated / phantom" identity — matched to the chart.
  // Text stays ink (contrast-safe); amber lives in the icon + border + wash.
  inflated:
    "border-[hsl(var(--chart-inflated)/0.35)] bg-[hsl(var(--chart-inflated)/0.12)] text-foreground",
  positive: "border-positive/30 bg-positive/10 text-positive",
  negative: "border-negative/30 bg-negative/10 text-negative",
};

function Chip({
  tone,
  icon: Icon,
  children,
}: {
  tone: ChipTone;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
        chipTones[tone],
      )}
    >
      {Icon ? (
        <Icon
          className={cn(
            "h-3 w-3",
            tone === "inflated" && "text-[hsl(var(--chart-inflated))]",
          )}
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  );
}

/** Composed StatTile value: animated headline + optional ghost + a callout chip. */
function HeroValue({
  primary,
  ghost,
  chip,
}: {
  primary: number;
  ghost?: number;
  chip: React.ReactNode;
}) {
  return (
    <span className="flex flex-col gap-2 leading-none">
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <AnimatedNaira value={primary} />
        {ghost != null ? <GhostFigure value={ghost} /> : null}
      </span>
      {chip}
    </span>
  );
}

function TilesSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-5">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-8 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-5 w-40 animate-pulse rounded bg-muted" />
        </Card>
      ))}
    </>
  );
}

/**
 * The three hero KPIs — Income, Spending, Net — reusing `StatTile`. The dedup
 * toggle (via `useDedup`) swaps every tile between the raw (inflated) and
 * honest (deduped) figures; `AnimatedNaira` tweens the transition so the drop
 * reads as a reveal.
 */
export function CashflowTiles() {
  const { data, isLoading, isError } = useDashboard();
  const { deduped } = useDedup();

  if (isLoading || !data) {
    if (isError) {
      return (
        <Card className="p-5 sm:col-span-2 xl:col-span-3">
          <p className="text-sm text-negative">
            Couldn&apos;t load your cashflow. Please retry.
          </p>
        </Card>
      );
    }
    return <TilesSkeleton />;
  }

  const active = deduped ? data.deduped : data.naive;
  const incomeRemoved = data.naive.income - data.deduped.income;
  const spendingRemoved = data.naive.spending - data.deduped.spending;
  const pctLabel = `${Math.round(data.phantomTransfers.pctOfRawInflow * 100)}%`;
  const netPositive = active.net >= 0;

  return (
    <>
      <StatTile
        label="Income"
        icon={<Wallet className="h-4 w-4" />}
        sublabel={
          deduped
            ? `True inflow across ${data.accounts} linked accounts`
            : "Raw inflow — self-transfers counted as income"
        }
        value={
          <HeroValue
            primary={active.income}
            ghost={deduped ? data.naive.income : undefined}
            chip={
              deduped ? (
                <Chip tone="inflated" icon={ArrowDown}>
                  {formatNaira(incomeRemoved, compact)} phantom · {pctLabel} of
                  raw
                </Chip>
              ) : (
                <Chip tone="inflated">
                  Inflated by {formatNaira(incomeRemoved, compact)} phantom
                  transfers
                </Chip>
              )
            }
          />
        }
      />

      <StatTile
        label="Spending"
        icon={<TrendingDown className="h-4 w-4" />}
        sublabel={
          deduped
            ? "True outflow after transfers out are removed"
            : "Raw outflow — includes transfers to your own accounts"
        }
        value={
          <HeroValue
            primary={active.spending}
            ghost={deduped ? data.naive.spending : undefined}
            chip={
              deduped ? (
                <Chip tone="inflated" icon={ArrowDown}>
                  {formatNaira(spendingRemoved, compact)} phantom removed
                </Chip>
              ) : (
                <Chip tone="inflated">
                  Inflated by {formatNaira(spendingRemoved, compact)} phantom
                  transfers
                </Chip>
              )
            }
          />
        }
      />

      <StatTile
        label="Net"
        icon={<Scale className="h-4 w-4" />}
        sublabel="Dedup fixes the size of each side — not your true balance"
        value={
          <HeroValue
            primary={active.net}
            ghost={deduped ? data.naive.net : undefined}
            chip={
              netPositive ? (
                <Chip tone="positive" icon={TrendingUp}>
                  Surplus
                </Chip>
              ) : (
                <Chip tone="negative" icon={TrendingDown}>
                  Deficit
                </Chip>
              )
            }
          />
        }
      />
    </>
  );
}

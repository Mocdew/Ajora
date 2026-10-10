"use client";

import * as React from "react";
import {
  Repeat,
  HeartHandshake,
  HandCoins,
  Globe,
  ArrowDownLeft,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn, formatNaira } from "@/lib/utils";
import { useCommunal } from "@/lib/api/communal";

const compact: Intl.NumberFormatOptions = {
  notation: "compact",
  maximumFractionDigits: 1,
};

/** Per-category accent, expressed as a CSS-var hsl() so it themes automatically.
 * These are card chrome (icon tint, hairline), not a data encoding — the figure
 * and labels carry meaning, so they're exempt from the categorical-palette cap. */
type Accent = "teal" | "gold" | "positive";
const accentColor: Record<Accent, string> = {
  teal: "hsl(var(--teal))",
  gold: "hsl(var(--gold))",
  positive: "hsl(var(--positive))",
};

interface Stat {
  label: string;
  value: string;
}

interface InsightCardProps {
  icon: LucideIcon;
  accent: Accent;
  category: string;
  /** Direction of the money relative to the user, shown as an icon + word. */
  flow: "in" | "out";
  /** Big pre-formatted headline figure (e.g. "₦50k"). */
  headline: string;
  /** Short qualifier after the headline (e.g. "/ month"). */
  headlineSuffix?: string;
  /** Supporting mini-stats row. */
  stats: Stat[];
  /** The deck-phrased human sentence. */
  detail: string;
}

const flowMeta = {
  out: { icon: ArrowUpRight, label: "Money out", className: "text-[hsl(var(--gold))]" },
  in: { icon: ArrowDownLeft, label: "Money in", className: "text-teal" },
} as const;

function InsightCard({
  icon: Icon,
  accent,
  category,
  flow,
  headline,
  headlineSuffix,
  stats,
  detail,
}: InsightCardProps) {
  const color = accentColor[accent];
  const Flow = flowMeta[flow].icon;

  return (
    <Card className="flex flex-col overflow-hidden">
      {/* Accent hairline — the category's color as a thin top rule. */}
      <div aria-hidden className="h-1 w-full" style={{ backgroundColor: color }} />
      <CardHeader className="gap-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
          >
            <Icon className="h-5 w-5" style={{ color }} aria-hidden />
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium",
              flowMeta[flow].className,
            )}
          >
            <Flow className="h-3 w-3" aria-hidden />
            {flowMeta[flow].label}
          </span>
        </div>
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {category}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {headline}
          </span>
          {headlineSuffix ? (
            <span className="text-sm text-muted-foreground">{headlineSuffix}</span>
          ) : null}
        </div>

        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {s.label}
              </dt>
              <dd className="text-sm font-medium tabular-nums text-foreground">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-auto border-t border-border/70 pt-3 text-sm leading-relaxed text-muted-foreground">
          {detail}
        </p>
      </CardContent>
    </Card>
  );
}

function CardSkeleton() {
  return <div className="h-64 w-full animate-pulse rounded-lg bg-muted/50" />;
}

/** The four communal-finance insight cards, driven by the stubbed `/communal`. */
export function CommunalInsightCards() {
  const { data, isLoading, isError } = useCommunal();

  if (isError) {
    return (
      <p className="text-sm text-negative">
        Couldn&apos;t load communal insights.
      </p>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const { ajo, dependents, lending, remittances } = data.insights;
  const pct = Math.round(dependents.pctOfTakeHome * 100);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <InsightCard
        icon={Repeat}
        accent="teal"
        category="Ajo / esusu"
        flow="out"
        headline={formatNaira(ajo.monthlyContribution, compact)}
        headlineSuffix="/ month"
        stats={[
          { label: "Rotation", value: `${ajo.rotationPosition} of ${ajo.rotationSize}` },
          { label: "Next payout", value: ajo.nextPayoutLabel },
          { label: "Payout", value: formatNaira(ajo.nextPayoutAmount, compact) },
        ]}
        detail={ajo.detail}
      />

      <InsightCard
        icon={HeartHandshake}
        accent="gold"
        category='Dependents · "black tax"'
        flow="out"
        headline={formatNaira(dependents.monthlySupport, compact)}
        headlineSuffix="/ month"
        stats={[
          { label: "Dependents", value: String(dependents.dependentCount) },
          { label: "Of take-home", value: `${pct}%` },
        ]}
        detail={dependents.detail}
      />

      <InsightCard
        icon={HandCoins}
        accent="positive"
        category="Informal lending"
        flow="in"
        headline={formatNaira(lending.outstanding, compact)}
        headlineSuffix="outstanding"
        stats={[
          { label: "Lent", value: formatNaira(lending.lent, compact) },
          { label: "Returned", value: formatNaira(lending.returned, compact) },
          { label: "To", value: lending.counterpartyName },
        ]}
        detail={lending.detail}
      />

      <InsightCard
        icon={Globe}
        accent="teal"
        category="Remittances"
        flow={remittances.direction === "inbound" ? "in" : "out"}
        headline={formatNaira(remittances.monthlyAmount, compact)}
        headlineSuffix="/ month"
        stats={[
          { label: "Destination", value: remittances.destinationLabel },
          { label: "Cadence", value: remittances.cadence },
        ]}
        detail={remittances.detail}
      />
    </div>
  );
}

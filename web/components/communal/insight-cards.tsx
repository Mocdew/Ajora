"use client";

import * as React from "react";
import {
  Repeat,
  HeartHandshake,
  HandCoins,
  Globe,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn, formatNaira } from "@/lib/utils";
import { useCommunalInsights } from "@/lib/api/communal";
import { usePersona } from "@/components/persona-context";
import { QueryError } from "@/components/query-error";
import {
  RELATIONSHIP_LABEL,
  composeInsightSentence,
  insightFlow,
  insightHeadline,
  prettyName,
  type Flow,
} from "@/lib/communal-insights";
import type {
  CommunalInsight,
  RelationshipType,
} from "@/lib/api/engine-types";

const compact: Intl.NumberFormatOptions = {
  notation: "compact",
  maximumFractionDigits: 1,
};

/** Per-type card chrome (icon + accent). Card chrome, not a data encoding — the
 * figures and labels carry meaning — so exempt from the categorical-palette cap. */
type Accent = "teal" | "gold" | "positive";
const accentColor: Record<Accent, string> = {
  teal: "hsl(var(--teal))",
  gold: "hsl(var(--gold))",
  positive: "hsl(var(--positive))",
};

const TYPE_CHROME: Record<RelationshipType, { icon: LucideIcon; accent: Accent }> = {
  ajo_esusu: { icon: Repeat, accent: "teal" },
  dependent: { icon: HeartHandshake, accent: "gold" },
  informal_lending: { icon: HandCoins, accent: "positive" },
  remittance: { icon: Globe, accent: "teal" },
};

const flowMeta: Record<Flow, { icon: LucideIcon; label: string; className: string }> = {
  out: { icon: ArrowUpRight, label: "Money out", className: "text-[hsl(var(--gold))]" },
  in: { icon: ArrowDownLeft, label: "Money in", className: "text-teal" },
  neutral: {
    icon: ArrowLeftRight,
    label: "Two-way",
    className: "text-muted-foreground",
  },
};

interface Stat {
  label: string;
  value: string;
}

/** The per-type supporting mini-stats row, from real fields. */
function statsFor(ins: CommunalInsight): Stat[] {
  const base: Stat[] = [
    { label: "Transactions", value: String(ins.count) },
    { label: "Cadence", value: ins.cadence },
  ];
  switch (ins.relationship_type) {
    case "informal_lending":
      return [
        { label: "Lent", value: formatNaira(ins.total_out_ngn, compact) },
        { label: "Repaid", value: formatNaira(ins.total_in_ngn, compact) },
        { label: "To", value: prettyName(ins.counterparty) },
      ];
    case "ajo_esusu":
      return [
        { label: "Contributed", value: formatNaira(ins.total_out_ngn, compact) },
        { label: "Collected", value: formatNaira(ins.total_in_ngn, compact) },
        { label: "Moves", value: String(ins.count) },
      ];
    case "dependent":
      return [
        { label: "Of net income", value: `${ins.pct_of_net_income.toFixed(1)}%` },
        ...base,
      ];
    case "remittance":
      return [
        { label: "Of net income", value: `${ins.pct_of_net_income.toFixed(1)}%` },
        { label: "Cadence", value: ins.cadence },
      ];
    default:
      return base;
  }
}

function InsightCard({ ins }: { ins: CommunalInsight }) {
  const { icon: Icon, accent } = TYPE_CHROME[ins.relationship_type];
  const color = accentColor[accent];
  const flow = insightFlow(ins);
  const Flow = flowMeta[flow].icon;
  const headline = insightHeadline(ins);
  const stats = statsFor(ins);

  return (
    <Card className="flex flex-col overflow-hidden">
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
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {RELATIONSHIP_LABEL[ins.relationship_type]}
          {ins.tier === "medium" ? (
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
              confirm
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {formatNaira(headline.value, compact)}
          </span>
          {headline.suffix ? (
            <span className="text-sm text-muted-foreground">{headline.suffix}</span>
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
          {composeInsightSentence(ins)}
        </p>
      </CardContent>
    </Card>
  );
}

function CardSkeleton() {
  return <div className="h-64 w-full animate-pulse rounded-lg bg-muted/50" />;
}

/** Clean empty state for a persona with no communal relationships (e.g. Adaeze). */
function EmptyInsights() {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Users className="h-6 w-6 text-muted-foreground" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">
          No communal relationships detected for this period
        </p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Once this persona&apos;s deduped ledger shows recurring ajo/esusu,
          dependent support, informal lending or remittances, they&apos;ll appear
          here. Try another persona from the switcher to see the invisible economy.
        </p>
      </div>
    </Card>
  );
}

/** The communal-finance insight cards, driven by the live `/insights` endpoint. */
export function CommunalInsightCards() {
  const { userId } = usePersona();
  const { data, isLoading, isError, error, refetch } =
    useCommunalInsights(userId);

  if (isError) {
    return <QueryError error={error} onRetry={() => refetch()} />;
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

  const insights = data.insights.insights ?? [];
  if (insights.length === 0) {
    return <EmptyInsights />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {insights.map((ins) => (
        <InsightCard key={`${ins.relationship_type}:${ins.counterparty}`} ins={ins} />
      ))}
    </div>
  );
}

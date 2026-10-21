"use client";

import {
  Repeat,
  HeartHandshake,
  HandCoins,
  Globe,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Users,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { cn, formatNaira } from "@/lib/utils";
import { useCommunalInsights } from "@/lib/api/communal";
import {
  communalNarration,
  useExplanations,
  type Explanation,
} from "@/lib/api/explanations";
import { usePersona } from "@/components/persona-context";
import { QueryError } from "@/components/query-error";
import {
  RELATIONSHIP_LABEL,
  composeInsightSentence,
  insightFlow,
  insightHeadline,
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

export const TYPE_ICON: Record<RelationshipType, LucideIcon> = {
  ajo_esusu: Repeat,
  dependent: HeartHandshake,
  informal_lending: HandCoins,
  remittance: Globe,
};

const flowMeta: Record<
  Flow,
  { icon: LucideIcon; label: string; tone: "out" | "in" | "neutral" }
> = {
  out: { icon: ArrowUpRight, label: "Money out", tone: "out" },
  in: { icon: ArrowDownLeft, label: "Money in", tone: "in" },
  neutral: { icon: ArrowLeftRight, label: "Two-way · Balanced", tone: "neutral" },
};

interface Stat {
  label: string;
  value: string;
}

function statsFor(ins: CommunalInsight): Stat[] {
  switch (ins.relationship_type) {
    case "informal_lending":
      return [
        { label: "Lent", value: formatNaira(ins.total_out_ngn, compact) },
        { label: "Repaid", value: formatNaira(ins.total_in_ngn, compact) },
        { label: "Status", value: `${ins.count} txns` },
      ];
    case "ajo_esusu":
      return [
        { label: "Contributed", value: formatNaira(ins.total_out_ngn, compact) },
        { label: "Collected", value: formatNaira(ins.total_in_ngn, compact) },
        { label: "Cycles", value: `${ins.count} moves` },
      ];
    case "dependent":
      return [
        { label: "Net income share", value: `${ins.pct_of_net_income.toFixed(1)}%` },
        { label: "Total transfers", value: `${ins.count} txns` },
        { label: "Cadence", value: ins.cadence },
      ];
    case "remittance":
      return [
        { label: "Net income share", value: `${ins.pct_of_net_income.toFixed(1)}%` },
        { label: "Transfers", value: `${ins.count} txns` },
        { label: "Cadence", value: ins.cadence },
      ];
    default:
      return [
        { label: "Transfers", value: `${ins.count} txns` },
        { label: "Cadence", value: ins.cadence },
      ];
  }
}

export function FlowPill({ flow }: { flow: Flow }) {
  const { icon: Icon, label, tone } = flowMeta[flow];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        tone === "out"
          ? "bg-[hsl(var(--gold)/0.14)] text-[hsl(36_60%_34%)] dark:text-[hsl(var(--gold))]"
          : "bg-mint text-mint-foreground",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

function InsightCard({
  ins,
  narration,
}: {
  ins: CommunalInsight;
  narration?: Explanation;
}) {
  const Icon = TYPE_ICON[ins.relationship_type];
  const flow = insightFlow(ins);
  const headline = insightHeadline(ins);
  const stats = statsFor(ins);

  return (
    <div className="card-soft card-hover flex flex-col p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-accent">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <FlowPill flow={flow} />
      </div>

      <p className="label-mono mt-4">{RELATIONSHIP_LABEL[ins.relationship_type]}</p>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-[2.2rem] font-bold leading-none tabular-nums tracking-tight text-foreground">
          {formatNaira(headline.value, compact)}
        </span>
        {headline.suffix ? (
          <span className="text-sm text-muted-foreground">{headline.suffix}</span>
        ) : null}
      </div>

      {narration ? (
        <div className="mt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint px-2.5 py-1 text-[11px] font-semibold text-mint-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Grounded
          </span>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {narration.narration}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {composeInsightSentence(ins)}
        </p>
      )}

      <dl className="mt-5 space-y-2.5 border-t border-border pt-4">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-3">
            <dt className="label-mono">{s.label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CardSkeleton() {
  return <div className="h-72 w-full animate-pulse rounded-2xl bg-muted/50" />;
}

function EmptyInsights() {
  return (
    <div className="card-soft flex flex-col items-center justify-center gap-3 p-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        <Users className="h-6 w-6 text-accent" aria-hidden />
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
    </div>
  );
}

/** The communal-finance insight cards, driven by the live `/insights` endpoint. */
export function CommunalInsightCards() {
  const { userId } = usePersona();
  const { data, isLoading, isError, error, refetch } =
    useCommunalInsights(userId);
  const { data: explanations } = useExplanations(userId);

  if (isError) {
    return <QueryError error={error} onRetry={() => refetch()} />;
  }
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
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
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {insights.map((ins) => (
        <InsightCard
          key={`${ins.relationship_type}:${ins.counterparty}`}
          ins={ins}
          narration={communalNarration(explanations, ins)}
        />
      ))}
    </div>
  );
}

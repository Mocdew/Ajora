"use client";

import * as React from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  MousePointerClick,
  X,
} from "lucide-react";
import { cn, formatNaira } from "@/lib/utils";
import { FlowPill, TYPE_ICON } from "@/components/communal/insight-cards";
import type { Explanation } from "@/lib/api/explanations";
import {
  RELATIONSHIP_LABEL,
  composeInsightSentence,
  insightFlow,
  insightHeadline,
  prettyName,
} from "@/lib/communal-insights";
import type {
  CommunalInsight,
  EngineTransaction,
  RelationshipType,
} from "@/lib/api/engine-types";

/**
 * Side panel for the relationship graph. With a node selected it shows that
 * relationship's engine figures, its grounded narration, the engine's reasons and
 * the member transactions; with nothing selected it lists the visible
 * counterparties as buttons — the keyboard path into the (canvas-only) graph.
 * Every figure is read straight off the engine's `CommunalInsight`.
 */

const compact: Intl.NumberFormatOptions = {
  notation: "compact",
  maximumFractionDigits: 1,
};

const dateFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

/** A ledger amount in its own currency (a remittance leg may be USD/GBP). */
function formatAmount(t: EngineTransaction): string {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: t.currency,
      maximumFractionDigits: t.currency === "NGN" ? 0 : 2,
    }).format(t.amount);
  } catch {
    return `${t.currency} ${t.amount.toLocaleString()}`;
  }
}

interface Detail {
  label: string;
  value: string;
}

function detailsFor(ins: CommunalInsight): Detail[] {
  const rows: Detail[] = [
    { label: "Money out", value: formatNaira(ins.total_out_ngn) },
    { label: "Money in", value: formatNaira(ins.total_in_ngn) },
  ];
  if (ins.relationship_type === "informal_lending") {
    rows.push({
      label: ins.net_position_ngn >= 0 ? "Still owed to you" : "You still owe",
      value: formatNaira(Math.abs(ins.net_position_ngn)),
    });
  }
  if (ins.pct_of_net_income > 0) {
    rows.push({
      label: "Share of net income",
      value: `${ins.pct_of_net_income.toFixed(1)}%`,
    });
  }
  rows.push(
    { label: "Transactions", value: String(ins.count) },
    { label: "Cadence", value: ins.cadence },
    {
      label: "Active",
      value: `${formatDate(ins.first_seen)} – ${formatDate(ins.last_seen)} · ${ins.months_active} mo`,
    },
    {
      label: "Confidence",
      value: `${ins.tier} · ${Math.round(ins.confidence * 100)}%`,
    },
  );
  return rows;
}

export interface InspectorOption {
  id: string;
  label: string;
  relationshipType: RelationshipType;
}

interface RelationshipInspectorProps {
  insight?: CommunalInsight;
  narration?: Explanation;
  transactions?: EngineTransaction[];
  transactionsLoading: boolean;
  /** Visible counterparties, offered when nothing is selected. */
  options: InspectorOption[];
  onSelect: (id: string) => void;
  onClose: () => void;
  className?: string;
}

export function RelationshipInspector({
  insight,
  narration,
  transactions,
  transactionsLoading,
  options,
  onSelect,
  onClose,
  className,
}: RelationshipInspectorProps) {
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);

  // Move focus to the panel heading on selection so screen readers announce it.
  React.useEffect(() => {
    if (insight) headingRef.current?.focus();
  }, [insight]);

  const shell = cn(
    "flex flex-col rounded-md border border-border bg-card xl:h-[460px]",
    className,
  );

  if (!insight) {
    return (
      <aside aria-label="Relationship details" className={cn(shell, "p-5")}>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-accent">
          <MousePointerClick className="h-5 w-5" aria-hidden />
        </span>
        <p className="mt-3 text-sm font-semibold text-foreground">
          Inspect a relationship
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Click a node in the graph, or pick one here, to see its figures,
          narration and transactions.
        </p>
        {options.length > 0 ? (
          <ul className="mt-4 space-y-1.5 overflow-y-auto">
            {options.map((o) => {
              const Icon = TYPE_ICON[o.relationshipType];
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(o.id)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {o.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {RELATIONSHIP_LABEL[o.relationshipType]}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Every relationship type is filtered out.
          </p>
        )}
      </aside>
    );
  }

  const Icon = TYPE_ICON[insight.relationship_type];
  const headline = insightHeadline(insight);
  const memberIds = new Set(insight.member_transaction_ids ?? []);
  const members = (transactions ?? [])
    .filter((t) => memberIds.has(t.id))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <aside aria-label="Relationship details" className={shell}>
      <div className="flex items-start justify-between gap-3 border-b border-border p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-accent">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="label-mono">{RELATIONSHIP_LABEL[insight.relationship_type]}</p>
            <h3
              ref={headingRef}
              tabIndex={-1}
              className="mt-1 truncate font-display text-lg font-bold tracking-tight text-foreground focus:outline-none"
            >
              {prettyName(insight.counterparty)}
            </h3>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div>
          <FlowPill flow={insightFlow(insight)} />
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold leading-none tabular-nums tracking-tight text-foreground">
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
              {composeInsightSentence(insight)}
            </p>
          )}
        </div>

        <dl className="space-y-2 border-t border-border pt-4">
          {detailsFor(insight).map((d) => (
            <div key={d.label} className="flex items-baseline justify-between gap-3">
              <dt className="label-mono shrink-0">{d.label}</dt>
              <dd className="text-right text-sm font-semibold tabular-nums text-foreground">
                {d.value}
              </dd>
            </div>
          ))}
        </dl>

        {insight.reasons && insight.reasons.length > 0 ? (
          <div className="border-t border-border pt-4">
            <p className="label-mono">Why Ajora flagged this</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
              {insight.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="border-t border-border pt-4">
          <p className="label-mono">Transactions</p>
          {transactionsLoading ? (
            <div className="mt-2 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Transactions aren&apos;t available right now.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {members.map((t) => {
                const credit = t.direction === "credit";
                const Arrow = credit ? ArrowDownLeft : ArrowUpRight;
                return (
                  <li key={t.id} className="flex items-start gap-2.5 py-2">
                    <Arrow
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        credit ? "text-[hsl(var(--teal))]" : "text-[hsl(var(--gold))]",
                      )}
                      aria-label={credit ? "Money in" : "Money out"}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-foreground" title={t.narration}>
                        {t.narration}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDate(t.timestamp)} · {t.institution}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {credit ? "+" : "−"}
                      {formatAmount(t)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

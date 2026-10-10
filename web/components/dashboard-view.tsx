"use client";

import { Users, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DedupToggle } from "@/components/dedup-toggle";
import { CashflowTiles } from "@/components/cashflow-tiles";
import { CashflowChart } from "@/components/cashflow-chart";
import { useDashboard } from "@/lib/api/dashboard";
import { useExplanations } from "@/lib/api/explanations";
import { useCommunalInsights } from "@/lib/api/communal";
import { useDedup } from "@/components/dedup-context";
import { usePersona } from "@/components/persona-context";
import { composeInsightTeaser } from "@/lib/communal-insights";
import { cn, formatNaira } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const compact: Intl.NumberFormatOptions = {
  notation: "compact",
  maximumFractionDigits: 2,
};

/**
 * The headline phantom-transfer callout — the inflation reveal in words. Flips copy
 * with the dedup toggle so the banner always narrates the current view, in the amber
 * "inflated" identity.
 */
function PhantomCallout() {
  const { userId } = usePersona();
  const { data } = useDashboard(userId);
  const { deduped } = useDedup();
  if (!data) return null;

  const { incomeRemoved, count, incomeInflationPct } = data.phantom;
  const pct = Math.round(incomeInflationPct);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-3 py-2 text-sm",
        "border-[hsl(var(--chart-inflated)/0.35)] bg-[hsl(var(--chart-inflated)/0.1)]",
      )}
    >
      <Sparkles
        className="h-4 w-4 shrink-0 text-[hsl(var(--chart-inflated))]"
        aria-hidden
      />
      {deduped ? (
        <p className="text-foreground">
          <span className="font-semibold tabular-nums">
            −{formatNaira(incomeRemoved, compact)}
          </span>{" "}
          phantom transfers removed ·{" "}
          <span className="font-semibold tabular-nums">{pct}%</span> income
          inflation ·{" "}
          <span className="tabular-nums">{count}</span> matched self-transfers
        </p>
      ) : (
        <p className="text-foreground">
          Raw view — your inflow is inflated by{" "}
          <span className="font-semibold tabular-nums">
            {formatNaira(incomeRemoved, compact)}
          </span>{" "}
          in double-counted self-transfers.{" "}
          <span className="text-muted-foreground">
            Flip the switch to see the truth.
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * The grounded narration of the dedup result — accurate LLM prose captured verbatim
 * from the real engine output, per persona. (The engine exposes no `/explanations`
 * endpoint yet, so this resolves the verbatim per-persona stub; it switches with the
 * active persona.)
 */
function GroundedNarration() {
  const { userId } = usePersona();
  const { data, isLoading, isError } = useExplanations(userId);
  if (isError) return null;

  const dedup = data?.explanations.dedup;

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-teal" aria-hidden />
        Explained by Ajora AI
        {dedup?.grounded ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[hsl(var(--positive)/0.12)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--positive))]">
            ✓ grounded
          </span>
        ) : null}
      </div>
      {isLoading || !dedup ? (
        <div className="space-y-2" aria-hidden>
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-foreground">{dedup.narration}</p>
      )}
    </div>
  );
}

/** The dashboard's communal preview — the top few real insights, or an empty note. */
function CommunalPreview() {
  const { userId } = usePersona();
  const { data, isLoading, isError } = useCommunalInsights(userId);

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Communal insights are unavailable right now.
      </p>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 w-full animate-pulse rounded-md bg-muted/50" />
        ))}
      </div>
    );
  }

  const insights = data.insights.insights ?? [];
  if (insights.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          No communal relationships detected for this persona — a clean, honest
          ledger once phantom transfers are removed.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {insights.slice(0, 3).map((ins) => (
        <div
          key={`${ins.relationship_type}:${ins.counterparty}`}
          className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
        >
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />
          <span>{composeInsightTeaser(ins)}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardView() {
  const { userId } = usePersona();
  const { data } = useDashboard(userId);

  return (
    <div>
      <PageHeader
        eyebrow={data ? `Overview · ${data.fullName}` : "Overview"}
        title="Your true cashflow"
        description="One honest view across every bank and wallet — once the phantom self-transfers are stripped away."
        actions={<DedupToggle />}
      />

      {/* Hero KPI row — Income / Spending / Net, driven by the dedup toggle. */}
      <section
        aria-label="Key figures"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <CashflowTiles />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="gap-3">
            <div className="space-y-1.5">
              <CardTitle>Cashflow over time</CardTitle>
              <CardDescription>
                Raw vs. deduplicated income. The shaded gap is the phantom
                self-transfers Ajora removes.
              </CardDescription>
            </div>
            <PhantomCallout />
            <GroundedNarration />
          </CardHeader>
          <CardContent>
            <CashflowChart />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Communal insights</CardTitle>
            <CardDescription>
              The invisible economy, surfaced after dedup.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CommunalPreview />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

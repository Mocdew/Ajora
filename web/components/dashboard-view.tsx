"use client";

import Link from "next/link";
import {
  Sparkles,
  Users,
  Lock,
  ArrowRight,
  Repeat,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DedupToggle } from "@/components/dedup-toggle";
import { CashflowTiles } from "@/components/cashflow-tiles";
import { CashflowChart } from "@/components/cashflow-chart";
import { useDashboard } from "@/lib/api/dashboard";
import { useExplanations } from "@/lib/api/explanations";
import { useCommunalInsights } from "@/lib/api/communal";
import { usePersona } from "@/components/persona-context";
import {
  composeInsightTeaser,
  insightHeadline,
  prettyName,
} from "@/lib/communal-insights";
import type { RelationshipType } from "@/lib/api/engine-types";
import { formatNaira } from "@/lib/utils";

const compact: Intl.NumberFormatOptions = {
  notation: "compact",
  maximumFractionDigits: 2,
};

const COMMUNAL_TAG: Record<RelationshipType, string> = {
  dependent: "Kin Outflow",
  informal_lending: "Receivable",
  ajo_esusu: "Balanced",
  remittance: "Remittance",
};

/** The grounded narration of the dedup result — real engine-verified prose. */
function GroundedNarration() {
  const { userId } = usePersona();
  const { data: dash } = useDashboard(userId);
  const { data, isLoading, isError } = useExplanations(userId);
  if (isError) return null;

  const dedup = data?.explanations.dedup;
  const grounded = dedup?.grounded;

  return (
    <div className="card-soft p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">Explained by Ajora AI</span>
        {grounded ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint px-2.5 py-1 text-[11px] font-semibold text-mint-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Grounded
          </span>
        ) : null}
      </div>

      {isLoading || !dedup ? (
        <div className="mt-4 space-y-2" aria-hidden>
          <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-11/12 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <p className="mt-4 text-[15px] leading-relaxed text-foreground">
          {dedup.narration}
        </p>
      )}

      {dash ? (
        <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-card text-accent shadow-sm">
              <Repeat className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Phantom loops reconciled
              </p>
              <p className="text-xs text-muted-foreground">
                {dash.phantom.count} self-transfer loop
                {dash.phantom.count === 1 ? "" : "s"} · internal wallet
                pass-through
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-lg font-bold tabular-nums text-foreground">
              {formatNaira(dash.phantom.transferVolume, compact)}
            </p>
            <p className="label-mono text-[10px]">reclassified</p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Reclassified as internal wallet liquidity pass-through.
        </p>
        <Link
          href="/audit"
          className="inline-flex items-center gap-1 text-sm font-semibold text-accent transition-colors hover:text-accent/80"
        >
          Inspect audit trail
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/** The dashboard's communal preview — top real insights, or an empty note. */
function CommunalPreview() {
  const { userId } = usePersona();
  const { data, isLoading, isError } = useCommunalInsights(userId);

  return (
    <div className="card-soft flex flex-col p-6">
      <span className="eyebrow">Social ledger depth</span>
      <h2 className="mt-2 font-display text-xl font-bold tracking-tight text-foreground">
        Communal insights
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The invisible economy, surfaced after phantom self-transfers are cleared.
      </p>

      <div className="mt-5 flex-1 space-y-3">
        {isError ? (
          <p className="text-sm text-muted-foreground">
            Communal insights are unavailable right now.
          </p>
        ) : isLoading || !data ? (
          [0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 w-full animate-pulse rounded-xl bg-muted/50"
            />
          ))
        ) : (data.insights.insights ?? []).length === 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
            <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              No communal relationships for this persona — a clean, honest ledger
              once phantom transfers are removed.
            </span>
          </div>
        ) : (
          (data.insights.insights ?? []).slice(0, 3).map((ins) => {
            const h = insightHeadline(ins);
            return (
              <div
                key={`${ins.relationship_type}:${ins.counterparty}`}
                className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-xl font-bold tabular-nums text-foreground">
                    {formatNaira(h.value, compact)}
                  </span>
                  <span className="pill-mint">
                    {COMMUNAL_TAG[ins.relationship_type]}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-foreground">
                  {prettyName(ins.counterparty)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {composeInsightTeaser(ins)}
                </p>
              </div>
            );
          })
        )}
      </div>

      <Link
        href="/communal"
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
      >
        Explore Communal Ledger
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

function DeterministicRuleMatch() {
  return (
    <div className="card-soft flex items-start gap-3 p-5">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-accent">
        <Lock className="h-4 w-4" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">
          Deterministic rule match
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Ajora runs locally on synced metadata. No bank credentials or transfer
          tokens are persisted — nothing collected &ldquo;just in case&rdquo;.
        </p>
      </div>
    </div>
  );
}

export function DashboardView() {
  const { userId } = usePersona();
  const { data } = useDashboard(userId);

  return (
    <div>
      <PageHeader
        eyebrow="Intelligent ledger reconstruction"
        title="Your true cashflow"
        description="One honest view across every bank and wallet — once the phantom self-transfers are stripped away."
        actions={<DedupToggle />}
      />
      {data ? (
        <p className="-mt-4 mb-6 text-sm text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{data.fullName}</span>
        </p>
      ) : null}

      <section
        aria-label="Key figures"
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3"
      >
        <CashflowTiles />
      </section>

      <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="card-soft p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="eyebrow">Liquidity tracking</span>
                <h2 className="mt-2 font-display text-xl font-bold tracking-tight text-foreground">
                  Cashflow over time
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Raw vs. deduplicated income. The shaded gap is the phantom
                  self-transfers Ajora removes.
                </p>
              </div>
              <span className="pill-mint">
                <Sparkles className="h-3 w-3" aria-hidden />
                Live engine
              </span>
            </div>
            <div className="mt-5">
              <CashflowChart />
            </div>
          </div>

          <GroundedNarration />
        </div>

        <div className="space-y-5">
          <CommunalPreview />
          <DeterministicRuleMatch />
        </div>
      </section>
    </div>
  );
}

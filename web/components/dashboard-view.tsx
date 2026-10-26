"use client";

import Link from "next/link";
import {
  Sparkle,
  Users,
  Vault,
  ArrowRight,
  Repeat,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import { Reveal } from "@/components/reveal";
import { DedupToggle } from "@/components/dedup-toggle";
import { CashflowTiles } from "@/components/cashflow-tiles";
import { CashflowChart } from "@/components/cashflow-chart";
import { useDashboard } from "@/lib/api/dashboard";
import { communalNarration, useExplanations } from "@/lib/api/explanations";
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
  dependent: "Kin outflow",
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
        <span className="eyebrow">Explained by Ajora</span>
        {grounded ? (
          <span className="badge">
            <CheckCircle className="h-3.5 w-3.5" aria-hidden />
            Grounded
          </span>
        ) : null}
      </div>

      {isLoading || !dedup ? (
        <div className="mt-4 space-y-2" aria-hidden>
          <div className="h-4 w-full animate-pulse rounded bg-secondary" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-secondary" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-secondary" />
        </div>
      ) : (
        <p className="mt-4 max-w-prose text-base text-foreground">
          {dedup.narration}
        </p>
      )}

      {dash ? (
        <div className="panel-inset mt-6 flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-card text-accent">
              <Repeat className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Phantom loops reconciled
              </p>
              <p className="text-xs text-muted-foreground">
                {dash.phantom.count} self-transfer loop
                {dash.phantom.count === 1 ? "" : "s"} between your own
                accounts
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold tabular-nums text-foreground">
              {formatNaira(dash.phantom.transferVolume, compact)}
            </p>
            <p className="caption">reclassified</p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Counted as money moving between your accounts, not income.
        </p>
        <Link
          href="/audit"
          className="link-accent group"
        >
          Inspect audit trail
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/** The dashboard's communal preview — top real insights, or an empty note. */
function CommunalPreview() {
  const { userId } = usePersona();
  const { data, isLoading, isError } = useCommunalInsights(userId);
  const { data: explanations } = useExplanations(userId);

  return (
    <div className="card-soft flex flex-col p-6">
      <span className="eyebrow">Communal finance</span>
      <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground">
        Communal insights
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ajo, dependents, loans and remittances, found once self-transfers are cleared.
      </p>

      <div className="mt-6 flex-1 space-y-3">
        {isError ? (
          <p className="text-sm text-muted-foreground">
            Communal insights are unavailable right now.
          </p>
        ) : isLoading || !data ? (
          [0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 w-full animate-pulse rounded-xl bg-secondary"
            />
          ))
        ) : (data.insights.insights ?? []).length === 0 ? (
          <div className="panel-inset flex items-start gap-3 p-4 text-sm text-muted-foreground">
            <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              No communal relationships for this persona. Once phantom
              transfers are removed, this ledger has nothing to surface.
            </span>
          </div>
        ) : (
          (data.insights.insights ?? []).slice(0, 3).map((ins) => {
            const h = insightHeadline(ins);
            const narration = communalNarration(explanations, ins);
            return (
              <div
                key={`${ins.relationship_type}:${ins.counterparty}`}
                className="panel-inset p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xl font-bold tabular-nums text-foreground">
                    {formatNaira(h.value, compact)}
                  </span>
                  <span className="badge">
                    {COMMUNAL_TAG[ins.relationship_type]}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {prettyName(ins.counterparty)}
                </p>
                {narration ? (
                  <p className="mt-1 text-xs text-foreground">
                    <CheckCircle
                      className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-accent"
                      aria-label="Grounded"
                    />
                    {narration.narration}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {composeInsightTeaser(ins)}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      <Link
        href="/communal"
        className="btn-primary group mt-6"
      >
        Open communal insights
        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

function DeterministicRuleMatch() {
  return (
    <div className="card-soft flex items-start gap-3 p-6">
      <span className="panel-inset inline-flex h-9 w-9 shrink-0 items-center justify-center text-accent">
        <Vault className="h-4 w-4" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">
          Raw transactions are never stored
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Each request pulls, dedups and classifies in memory, then discards
          the raw ledger. Nothing is collected &ldquo;just in case&rdquo;.
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
        eyebrow="Dashboard"
        title="Your true cashflow"
        description="One honest view across every bank and wallet, with the phantom self-transfers removed."
        actions={<DedupToggle />}
      />
      {data ? (
        <p className="-mt-4 mb-6 text-sm text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{data.fullName}</span>
        </p>
      ) : null}

      <section
        aria-label="Key figures"
        className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3"
      >
        <CashflowTiles />
      </section>

      <Reveal as="section" className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card-soft p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="eyebrow">Monthly income</span>
                <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground">
                  Cashflow over time
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Raw against deduplicated income. The shaded gap is the
                  phantom self-transfers Ajora removes.
                </p>
              </div>
              <span className="badge">
                <Sparkle className="h-3 w-3" aria-hidden />
                Computed by the engine
              </span>
            </div>
            <div className="mt-6">
              <CashflowChart />
            </div>
          </div>

          <GroundedNarration />
        </div>

        <div className="space-y-6">
          <CommunalPreview />
          <DeterministicRuleMatch />
        </div>
      </Reveal>
    </div>
  );
}

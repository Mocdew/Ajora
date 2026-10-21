import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { CommunalInsightCards } from "@/components/communal/insight-cards";
import { RelationshipGraph } from "@/components/communal/relationship-graph";

export const metadata: Metadata = { title: "Communal" };

export default function CommunalPage() {
  return (
    <div>
      <PageHeader
        eyebrow="The story, our edge"
        title="Communal & Relationships"
        description="Nigeria's invisible economy, finally visible — ajo/esusu, dependents, informal lending and remittances, surfaced only after the phantom self-transfers are stripped away."
      />

      <section aria-label="Communal insights">
        <CommunalInsightCards />
      </section>

      <section aria-label="Relationship graph" className="mt-6">
        <div className="card-soft p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 pb-5">
            <div>
              <span className="eyebrow">Relationship topology &amp; capital flow</span>
              <h2 className="mt-2 font-display text-xl font-bold tracking-tight text-foreground">
                Peer-to-peer liquidity graph
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                You at the center, every counterparty around you. Arrows follow
                the money — teal flows in or is owed to you, amber flows out, gray
                is a balanced two-way circle. Click a node to inspect it, filter
                by relationship type, or drag nodes to rearrange.
              </p>
            </div>
          </div>
          <RelationshipGraph />
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-secondary/50 p-5">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-accent shadow-sm">
            <BadgeCheck className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              De-duplication engine active
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Internal self-transfers across your linked accounts are recognized
              and excluded from communal balances — so ajo, lending and
              dependent totals reflect real money moved, never double-counted.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

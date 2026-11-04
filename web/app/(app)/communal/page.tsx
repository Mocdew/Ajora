import type { Metadata } from "next";
import { SealCheck } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import { CommunalInsightCards } from "@/components/communal/insight-cards";
import { RelationshipGraph } from "@/components/communal/relationship-graph";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = { title: "Communal" };

export default function CommunalPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Communal finance"
        title="Communal & relationships"
        description="Ajo and esusu circles, dependents, informal loans and remittances. Ajora surfaces them only after your own self-transfers are removed."
      />

      <Reveal as="section" aria-label="Communal insights">
        <CommunalInsightCards />
      </Reveal>

      <Reveal as="section" aria-label="Relationship graph" className="mt-6">
        <div className="card-soft p-6">
          <div className="pb-6">
            <span className="eyebrow">Who your money moves with</span>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground">
              Relationship graph
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              You sit at the centre, with every counterparty around you. Arrows
              follow the money: green flows in or is owed to you, gray flows
              out, and a fainter gray is a balanced two-way circle. Select a node
              to inspect it, filter by relationship type, or drag nodes to
              rearrange.
            </p>
          </div>
          <RelationshipGraph />
        </div>
      </Reveal>

      <Reveal as="section" className="mt-6">
        <div className="panel-inset flex items-start gap-3 p-6">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card text-accent">
            <SealCheck className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Self-transfers are excluded
            </p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              Transfers between your own linked accounts are recognised and left
              out of communal balances, so ajo, lending and dependent totals show
              money that really moved, counted once.
            </p>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

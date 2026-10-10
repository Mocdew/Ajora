import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

      <section aria-label="Communal insights" className="space-y-4">
        <CommunalInsightCards />
      </section>

      <section aria-label="Relationship graph" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Relationship graph</CardTitle>
            <CardDescription>
              You at the center, every counterparty around you. Arrows follow the
              money — teal flows in or is owed to you, amber flows out. Drag a node
              to explore; hover to trace its flows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RelationshipGraph />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Communal" };

export default function CommunalPage() {
  return (
    <div>
      <PageHeader
        eyebrow="The story, our edge"
        title="Communal & Relationships"
        description="Ajo/esusu, dependents, informal lending and remittances — the invisible economy, classified and graphed."
      />
      <ComingSoon note="The relationship graph (React Flow / Cytoscape) and communal classifiers land in the insight-engine phase." />
    </div>
  );
}

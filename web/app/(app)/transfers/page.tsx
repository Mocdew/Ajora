import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { EngineStatus } from "@/components/engine-status";
import { TransfersView } from "@/components/transfers/transfers-view";

export const metadata: Metadata = { title: "Transfers" };

export default function TransfersPage() {
  return (
    <div>
      <PageHeader
        eyebrow="The engine"
        title="Transfers & dedup"
        description="Money you moved between your own accounts, matched exactly once and sorted by how sure the engine is."
        actions={<EngineStatus />}
      />
      <TransfersView />
    </div>
  );
}

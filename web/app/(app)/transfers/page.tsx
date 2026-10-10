import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Transfers & Dedup" };

export default function TransfersPage() {
  return (
    <div>
      <PageHeader
        eyebrow="The engine"
        title="Transfers & Dedup"
        description="Cross-institution self-transfers, matched exactly once with Hungarian pairing and sorted into confidence tiers."
      />
      <ComingSoon note="The dedup review queue — candidate matches, confidence tiers, and confirm/reject feedback — lands in the dedup-engine phase." />
    </div>
  );
}

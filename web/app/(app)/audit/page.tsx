import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Audit" };

export default function AuditPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Security & trust"
        title="Audit log"
        description="An append-only record of every access — auditable, and never sold."
      />
      <ComingSoon note="The audit timeline reads from the append-only audit.jsonl log in a later phase." />
    </div>
  );
}

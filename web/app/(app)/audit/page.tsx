import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { AuditLog } from "@/components/trust/audit-log";

export const metadata: Metadata = { title: "Audit" };

export default function AuditPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Security & trust"
        title="Audit log"
        description="Append-only access log — auditable, never sold."
      />
      <AuditLog />
    </div>
  );
}

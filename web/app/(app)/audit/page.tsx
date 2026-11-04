import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { AuditLog } from "@/components/trust/audit-log";
import { ExportAuditButton } from "@/components/trust/export-audit-button";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Security & trust"
        title="Audit log"
        description="Every read of your data, appended to a log that is never edited and never sold."
        actions={<ExportAuditButton />}
      />
      <AuditLog />
    </div>
  );
}

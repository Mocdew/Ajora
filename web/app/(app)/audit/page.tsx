import type { Metadata } from "next";
import { FileCheck2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AuditLog } from "@/components/trust/audit-log";

export const metadata: Metadata = { title: "Audit Log" };

export default function AuditPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Security & trust"
        title="Audit log"
        description="Append-only access log — auditable, never sold."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-accent/40"
            >
              <FileCheck2 className="h-4 w-4 text-accent" aria-hidden />
              Export proof bundle
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary/60 px-3 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              <span className="label-mono text-[10px]">
                Merkle root: 0x93b…e4a2
              </span>
            </span>
          </div>
        }
      />
      <AuditLog />
    </div>
  );
}

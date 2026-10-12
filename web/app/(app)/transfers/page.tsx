import type { Metadata } from "next";
import { Cpu } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TransfersView } from "@/components/transfers/transfers-view";

export const metadata: Metadata = { title: "Transfers & Dedup" };

export default function TransfersPage() {
  return (
    <div>
      <PageHeader
        eyebrow="The engine"
        title="Transfers & Dedup"
        description="Cross-institution self-transfers, matched exactly once with Hungarian pairing and sorted into confidence tiers."
        actions={
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-sm">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-accent">
              <Cpu className="h-4 w-4" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-foreground">
                Bipartite Hungarian V2
              </p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                Active · engine online
              </p>
            </div>
          </div>
        }
      />
      <TransfersView />
    </div>
  );
}

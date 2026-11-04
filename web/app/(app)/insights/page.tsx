import type { Metadata } from "next";
import Link from "next/link";
import { DedupProvider } from "@/components/dedup-context";
import { DashboardView } from "@/components/dashboard-view";

export const metadata: Metadata = { title: "Financial insights" };

export default function InsightsPage() {
  return (
    <>
      <div className="mb-6 flex flex-wrap gap-4 text-sm">
        <Link className="link-accent" href="/transfers">Review self-transfers</Link>
        <Link className="link-accent" href="/communal">Communal insights</Link>
        <Link className="link-accent" href="/audit">Data access history</Link>
      </div>
      <DedupProvider><DashboardView /></DedupProvider>
    </>
  );
}

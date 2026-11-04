import type { Metadata } from "next";
import { DedupProvider } from "@/components/dedup-context";
import { DashboardView } from "@/components/dashboard-view";

export const metadata: Metadata = { title: "Financial insights" };

export default function InsightsPage() {
  return (
    <DedupProvider><DashboardView /></DedupProvider>
  );
}

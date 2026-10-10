import type { Metadata } from "next";
import { DedupProvider } from "@/components/dedup-context";
import { DashboardView } from "@/components/dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <DedupProvider>
      <DashboardView />
    </DedupProvider>
  );
}

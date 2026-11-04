import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ConnectedAccounts } from "@/components/trust/connected-accounts";

export const metadata: Metadata = { title: "Sample bank connections" };

export default function ConnectionsPage() {
  return <><PageHeader title="Sample bank connections" description="Optional demo connections for financial insights. These do not fund your savings circles." /><ConnectedAccounts /></>;
}

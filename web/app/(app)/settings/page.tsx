import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ConnectedAccounts } from "@/components/trust/connected-accounts";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Consent-first"
        title="Settings"
        description="Consent, connections & preferences — manage which banks and wallets feed your insights, and revoke access at any time."
      />
      <ConnectedAccounts />
    </div>
  );
}

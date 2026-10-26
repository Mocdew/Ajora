import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ConnectedAccounts } from "@/components/trust/connected-accounts";
import { ThemeSetting } from "@/components/theme-setting";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Consent-first"
        title="Settings"
        description="Choose which banks and wallets feed your insights. Revoke any of them at any time and it drops out of every figure."
      />
      <Reveal>
        <ConnectedAccounts />
      </Reveal>
      <Reveal className="mt-6">
        <ThemeSetting />
      </Reveal>
    </div>
  );
}

import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Consent-first"
        title="Settings"
        description="Manage connected banks, consent scope and revocation, and preferences."
      />
      <ComingSoon note="Connection management, consent scopes and revocation controls land in the experience-and-security phase." />
    </div>
  );
}

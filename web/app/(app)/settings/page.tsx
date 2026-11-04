import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ThemeSetting } from "@/components/theme-setting";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Make yourself at home"
        title="Settings"
        description="Manage appearance and learn how your savings records are handled."
      />
      <Reveal>
        <ThemeSetting />
      </Reveal>
      <Reveal className="mt-6">
        <section className="card-soft space-y-3 p-6">
          <h2 className="text-xl font-bold">Your savings profile</h2>
          <p className="max-w-prose text-sm text-muted-foreground">This preview uses a private browser session to identify you. Keep using this browser to return to your circles. Clearing its cookies loses access; account sign-in and recovery are not available yet.</p>
          <p className="max-w-prose text-sm text-muted-foreground">Ajora keeps circle rules, contribution records and payout history so your group can track its progress. Payments take place outside Ajora; a recorded payout is an organiser’s confirmation, not a bank receipt.</p>
        </section>
      </Reveal>
      <Reveal className="mt-6">
        <section className="card-soft space-y-4 p-6">
          <h2 className="text-xl font-bold">Optional financial insights</h2>
          <p className="text-sm text-muted-foreground">Explore the original cashflow tools with sample bank profiles. These insights are separate from your circle records.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/insights" className="link-accent">View financial insights</Link>
            <Link href="/connections" className="link-accent">Sample bank connections</Link>
            <Link href="/audit" className="link-accent">Data access history</Link>
          </div>
        </section>
      </Reveal>
    </div>
  );
}

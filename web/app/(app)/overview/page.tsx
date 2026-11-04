import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Fingerprint,
  Eye,
  Trash,
} from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import { Reveal } from "@/components/reveal";
import { navItems } from "@/lib/nav";

export const metadata: Metadata = { title: "Overview" };

const LEAD = {
  icon: Eye,
  title: "One honest view",
  body: "Ajora matches transfers between your own accounts and removes them, so income and spending show real money instead of the 30–40% that aggregators double-count.",
};

const PRINCIPLES = [
  {
    icon: Fingerprint,
    title: "Consent-first by design",
    body: "You connect each bank and wallet on its own and can revoke it. Revoke one and it drops out of every figure straight away.",
  },
  {
    icon: Trash,
    title: "Nothing kept just in case",
    body: "No stored raw bank ledger. Bank data is pulled, deduped and served per request, and every read is written to an append-only audit log. Circle records are stored separately.",
  },
];

export default function OverviewPage() {
  const sections = navItems.filter((item) => item.href !== "/overview");
  const LeadIcon = LEAD.icon;

  return (
    <div>
      <PageHeader
        eyebrow="How Ajora works"
        title="Overview"
        description="One consent-first view across every bank and wallet. Self-transfers are removed, the communal economy is surfaced, and every access is logged."
      />

      {/* Asymmetric: one lead principle, two supporting ones stacked beside it. */}
      <Reveal as="section" className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="card-soft flex flex-col justify-between p-8 lg:col-span-3">
          <span className="panel-inset inline-flex h-12 w-12 items-center justify-center text-accent">
            <LeadIcon className="h-6 w-6" aria-hidden />
          </span>
          <div className="mt-12">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              {LEAD.title}
            </h2>
            <p className="mt-3 max-w-prose text-base text-muted-foreground">
              {LEAD.body}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-6 lg:col-span-2">
          {PRINCIPLES.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="card-soft flex gap-4 p-6">
                <span className="panel-inset inline-flex h-10 w-10 shrink-0 items-center justify-center text-accent">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-foreground">
                    {p.title}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>

      <Reveal as="section" className="mt-12">
        <h2 className="pb-4 text-sm font-semibold text-muted-foreground">
          Jump into Ajora
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {sections.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="card-soft card-hover group flex items-start gap-4 p-6 active:scale-[0.99]"
              >
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
                    {item.title}
                    <ArrowRight
                      className="h-4 w-4 -translate-x-1 text-accent opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100"
                      aria-hidden
                    />
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </Reveal>
    </div>
  );
}

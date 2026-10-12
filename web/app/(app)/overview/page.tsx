import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Eye, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { navItems } from "@/lib/nav";

export const metadata: Metadata = { title: "Overview" };

const PRINCIPLES = [
  {
    icon: Eye,
    title: "One honest view",
    body: "Cross-institution self-transfers are matched and removed, so income and spending reflect real money — not 30–40% of phantom double-counting.",
  },
  {
    icon: ShieldCheck,
    title: "Consent-first by design",
    body: "Every bank and wallet is connected per-account and revocable. Revoke one and it drops out of every figure, live.",
  },
  {
    icon: Trash2,
    title: "Nothing kept just in case",
    body: "No database, no persisted raw ledger. Pulled, deduped and served per request — every read written to an append-only audit log.",
  },
];

export default function OverviewPage() {
  const sections = navItems.filter((item) => item.href !== "/overview");

  return (
    <div>
      <PageHeader
        eyebrow="Where Ajora stands this cycle"
        title="Overview"
        description="One consent-first view across every bank and wallet — the phantom self-transfers stripped away, the invisible communal economy surfaced, every access auditable."
      />

      <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {PRINCIPLES.map((p) => {
          const Icon = p.icon;
          return (
            <div key={p.title} className="card-soft p-6">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-accent">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-4 font-display text-lg font-bold tracking-tight text-foreground">
                {p.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {p.body}
              </p>
            </div>
          );
        })}
      </section>

      <section className="mt-8">
        <p className="label-mono pb-4">Jump into Ajora</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="card-soft card-hover group flex items-start gap-4 p-6"
              >
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="flex items-center gap-1.5 font-display text-lg font-bold tracking-tight text-foreground">
                    {item.title}
                    <ArrowRight
                      className="h-4 w-4 text-accent opacity-0 transition-opacity group-hover:opacity-100"
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
      </section>
    </div>
  );
}

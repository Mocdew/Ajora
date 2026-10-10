"use client";

import { Users, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DedupToggle } from "@/components/dedup-toggle";
import { CashflowTiles } from "@/components/cashflow-tiles";
import { CashflowChart } from "@/components/cashflow-chart";
import { useDashboard } from "@/lib/api/dashboard";
import { useDedup } from "@/components/dedup-context";
import { cn, formatNaira } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const compact: Intl.NumberFormatOptions = {
  notation: "compact",
  maximumFractionDigits: 2,
};

/**
 * The headline phantom-transfer callout — the "~38% inflation" reveal in words.
 * Flips copy with the dedup toggle so the banner always narrates the current
 * view, and uses the amber "inflated" identity (ink text, amber accents).
 */
function PhantomCallout() {
  const { data } = useDashboard();
  const { deduped } = useDedup();
  if (!data) return null;

  const { amountRemoved, count, pctOfRawInflow } = data.phantomTransfers;
  const pct = Math.round(pctOfRawInflow * 100);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-3 py-2 text-sm",
        "border-[hsl(var(--chart-inflated)/0.35)] bg-[hsl(var(--chart-inflated)/0.1)]",
      )}
    >
      <Sparkles
        className="h-4 w-4 shrink-0 text-[hsl(var(--chart-inflated))]"
        aria-hidden
      />
      {deduped ? (
        <p className="text-foreground">
          <span className="font-semibold tabular-nums">
            −{formatNaira(amountRemoved, compact)}
          </span>{" "}
          phantom transfers removed ·{" "}
          <span className="font-semibold tabular-nums">{pct}%</span> of raw
          inflow ·{" "}
          <span className="tabular-nums">{count}</span> matched self-transfers
        </p>
      ) : (
        <p className="text-foreground">
          Raw view — your inflow is inflated by{" "}
          <span className="font-semibold tabular-nums">
            {formatNaira(amountRemoved, compact)}
          </span>{" "}
          in double-counted self-transfers.{" "}
          <span className="text-muted-foreground">
            Flip the switch to see the truth.
          </span>
        </p>
      )}
    </div>
  );
}

export function DashboardView() {
  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Your true cashflow"
        description="One honest view across every bank and wallet — once the phantom self-transfers are stripped away."
        actions={<DedupToggle />}
      />

      {/* Hero KPI row — Income / Spending / Net, driven by the dedup toggle. */}
      <section
        aria-label="Key figures"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <CashflowTiles />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="gap-3">
            <div className="space-y-1.5">
              <CardTitle>Cashflow over time</CardTitle>
              <CardDescription>
                Raw vs. deduplicated monthly income. The shaded gap is the
                phantom self-transfers Ajora removes.
              </CardDescription>
            </div>
            <PhantomCallout />
          </CardHeader>
          <CardContent>
            <CashflowChart />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Communal insights</CardTitle>
            <CardDescription>
              The invisible economy, surfaced after dedup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                icon: Users,
                text: "₦50k monthly to your thrift group — 3rd of 8 in the rotation",
              },
              {
                icon: Users,
                text: "₦80k/month supports 2 dependents — 18% of take-home",
              },
              {
                icon: Users,
                text: "Tunde still owes you ₦80k (lent ₦120k, ₦40k returned)",
              },
            ].map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />
                <span>{text}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

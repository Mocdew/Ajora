"use client";

import Link from "next/link";
import { SearchCheck, ShieldCheck } from "lucide-react";
import { usePersona } from "@/components/persona-context";
import { QueryError } from "@/components/query-error";
import { DedupSummaryBar } from "@/components/transfers/dedup-summary-bar";
import { TierGroup } from "@/components/transfers/tier-group";
import { useDedupReview, useSubmitCorrection } from "@/lib/api/dedup";
import type {
  CorrectionVerdict,
  MatchedTransfer,
} from "@/lib/api/engine-types";

function ExplorerSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="space-y-3 border-border p-5 sm:border-l first:border-l-0"
          >
            <div className="h-3 w-28 animate-pulse rounded bg-muted" />
            <div className="h-7 w-24 animate-pulse rounded bg-muted" />
            <div className="h-3 w-36 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      {[0, 1].map((item) => (
        <div key={item} className="h-16 animate-pulse rounded-lg bg-muted/60" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <ShieldCheck className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="mt-4 font-display text-lg font-semibold text-foreground">
        No phantom transfers — this ledger is already honest.
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Ajora found no cross-account transaction pairs confident enough to remove
        from income or spending.
      </p>
    </div>
  );
}

export function TransfersView() {
  const { userId } = usePersona();
  const { data, isLoading, isError, error, refetch } = useDedupReview(userId);
  const correction = useSubmitCorrection(userId);

  if (isError) return <QueryError error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <ExplorerSkeleton />;

  const matches = data.matches ?? [];
  const byTier = matches.reduce<Record<MatchedTransfer["tier"], MatchedTransfer[]>>(
    (groups, match) => {
      groups[match.tier].push(match);
      return groups;
    },
    { high: [], medium: [], low: [] },
  );
  const correctionProps = {
    verdicts: correction.verdicts,
    pendingByMatchId: correction.pendingByMatchId,
    errorsByMatchId: correction.errorsByMatchId,
    onCorrection: (matchId: string, verdict: CorrectionVerdict) =>
      correction.mutate({ match_id: matchId, verdict }),
  };

  return (
    <div className="space-y-6">
      <DedupSummaryBar summary={data.before_after} />

      {data.unmatched_candidate_count > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
          <SearchCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <p className="text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">
              {data.unmatched_candidate_count}
            </span>{" "}
            transfer-like{" "}
            {data.unmatched_candidate_count === 1
              ? "transaction was"
              : "transactions were"}{" "}
            left untouched because Ajora could not find a confident matching leg.
          </p>
        </div>
      ) : null}

      {matches.length === 0 ? (
        <EmptyState />
      ) : (
        <section aria-label="Matched transfer pairs" className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              Matched transfer pairs
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open a confidence group to inspect both legs and the evidence behind
              every match.
            </p>
          </div>
          <TierGroup
            tier="high"
            matches={byTier.high}
            defaultOpen
            {...correctionProps}
          />
          <TierGroup
            tier="medium"
            matches={byTier.medium}
            defaultOpen={byTier.high.length === 0}
            {...correctionProps}
          />
          <TierGroup
            tier="low"
            matches={byTier.low}
            defaultOpen={byTier.high.length + byTier.medium.length === 0}
            {...correctionProps}
          />
        </section>
      )}

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="card-soft p-6">
          <span className="eyebrow">Pairing topology</span>
          <h3 className="mt-2 font-display text-lg font-bold tracking-tight text-foreground">
            Hungarian algorithm pair guarantee
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            No transaction is double-counted or mapped to multiple counterparties.
            By solving the assignment problem on a weighted bipartite graph —
            combining currency values, timestamp deltas and counterparty
            descriptors — Ajora strictly preserves true cashflow solvency.
          </p>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-secondary/50 px-4 py-3 font-mono text-xs">
            <span className="text-muted-foreground">Zero unassigned residuals</span>
            <span className="font-semibold text-accent">optimal cost · bounded</span>
          </div>
        </div>

        <div className="card-soft flex flex-col p-6">
          <span className="eyebrow">Audit-trail ready</span>
          <h3 className="mt-2 font-display text-lg font-bold tracking-tight text-foreground">
            Sealed into your append-only ledger
          </h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
            Every paired dedup decision is written to your personal append-only
            log. Export cryptographic proofs anytime — and access can be revoked
            at any second.
          </p>
          <Link
            href="/audit"
            className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:border-accent/40"
          >
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
            Open deduplication audit log
          </Link>
        </div>
      </section>
    </div>
  );
}

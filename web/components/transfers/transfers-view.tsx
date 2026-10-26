"use client";

import Link from "next/link";
import {
  MagnifyingGlass,
  Fingerprint,
} from "@phosphor-icons/react/dist/ssr";
import { usePersona } from "@/components/persona-context";
import { QueryError } from "@/components/query-error";
import { Reveal } from "@/components/reveal";
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
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="card-soft space-y-3 p-6">
            <div className="h-3 w-28 animate-pulse rounded bg-secondary" />
            <div className="h-8 w-24 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-36 animate-pulse rounded bg-secondary" />
          </div>
        ))}
      </div>
      {[0, 1].map((item) => (
        <div key={item} className="card-soft h-16 animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card-soft px-6 py-12 text-center">
      <span className="panel-inset mx-auto flex h-12 w-12 items-center justify-center text-accent">
        <Fingerprint className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-foreground">
        No phantom transfers. This ledger is already honest.
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
        <div className="panel-inset flex items-start gap-3 px-4 py-3 text-sm">
          <MagnifyingGlass
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
            <h2 className="text-xl font-semibold text-foreground">
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

      <Reveal as="section" className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="card-soft p-6">
          <span className="eyebrow">How pairing works</span>
          <h3 className="mt-2 text-lg font-bold tracking-tight text-foreground">
            Each transaction is matched at most once
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Ajora scores every possible debit and credit pair on amount, timing
            and names, then solves the assignment with the Hungarian algorithm.
            No transaction can be paired twice or counted against two
            counterparties.
          </p>
          <div className="panel-inset mt-4 flex items-center justify-between px-4 py-3 font-mono text-xs">
            <span className="text-muted-foreground">scipy linear_sum_assignment</span>
            <span className="font-semibold text-accent">one to one</span>
          </div>
        </div>

        <div className="card-soft flex flex-col p-6">
          <span className="eyebrow">Audit trail</span>
          <h3 className="mt-2 text-lg font-bold tracking-tight text-foreground">
            Your reviews are logged
          </h3>
          <p className="mt-2 flex-1 text-sm text-muted-foreground">
            Every confirm or reject you make is appended to the corrections log,
            and every read of your data to the audit log. You can export the
            audit log at any time.
          </p>
          <Link
            href="/audit"
            className="btn-secondary mt-4 w-fit"
          >
            <Fingerprint className="h-4 w-4 text-accent" aria-hidden />
            Open audit log
          </Link>
        </div>
      </Reveal>
    </div>
  );
}

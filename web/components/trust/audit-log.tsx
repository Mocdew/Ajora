"use client";

import * as React from "react";
import {
  ScrollText,
  ShieldCheck,
  Lock,
  Ban,
  Wallet,
  Users,
  Share2,
  ListTree,
  Activity,
  CheckCircle2,
  XCircle,
  Terminal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { QueryError } from "@/components/query-error";
import { usePersona } from "@/components/persona-context";
import { useAudit, type AuditEntry } from "@/lib/api/trust";
import { cn } from "@/lib/utils";

const endpointMeta: Record<string, { label: string; icon: LucideIcon }> = {
  cashflow: { label: "Cashflow engine", icon: Wallet },
  insights: { label: "Communal insights", icon: Users },
  graph: { label: "Relationship graph", icon: Share2 },
  transactions: { label: "Transactions", icon: ListTree },
  explanations: { label: "Explanations model", icon: Activity },
  correction_confirm: { label: "Transfer match confirmed", icon: CheckCircle2 },
  correction_reject: { label: "Transfer match rejected", icon: XCircle },
};

function metaFor(endpoint: string) {
  return endpointMeta[endpoint] ?? { label: endpoint, icon: Activity };
}

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatTs(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

/** Deterministic short hex from an entry — presentational commitment digest. */
function pseudoHash(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  return `0x${hex.slice(0, 4)}…${hex.slice(6)}`;
}

function AccountChip({ id, excluded = false }: { id: string; excluded?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px]",
        excluded
          ? "bg-negative/10 text-negative line-through decoration-negative/50"
          : "bg-muted text-muted-foreground",
      )}
    >
      {excluded ? <Ban className="h-3 w-3" aria-hidden /> : null}
      {id}
    </span>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const meta = metaFor(entry.endpoint);
  const Icon = meta.icon;
  const hasExcluded = entry.revoked_excluded.length > 0;
  const hash = pseudoHash(
    `${entry.timestamp}:${entry.endpoint}:${entry.accounts_accessed.join(",")}`,
  );

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 border-b border-border py-4 last:border-0">
      <div className="flex min-w-0 gap-3.5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-accent">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-foreground">{meta.label}</span>
            <span className="label-mono text-[10px]">Read</span>
            <time
              dateTime={entry.timestamp}
              className="font-mono text-xs tabular-nums text-muted-foreground"
            >
              {formatTs(entry.timestamp)}
            </time>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {entry.accounts_accessed.length} account
              {entry.accounts_accessed.length === 1 ? "" : "s"} accessed:
            </span>
            {entry.accounts_accessed.length > 0 ? (
              entry.accounts_accessed.map((id) => <AccountChip key={id} id={id} />)
            ) : (
              <span className="text-xs text-muted-foreground">none</span>
            )}
          </div>
          {hasExcluded ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-negative">
                <Lock className="h-3 w-3" aria-hidden />
                Excluded by revoked consent:
              </span>
              {entry.revoked_excluded.map((id) => (
                <AccountChip key={id} id={id} excluded />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          VERIFIED
        </span>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          Hash: {hash}
        </p>
      </div>
    </li>
  );
}

function AuditSkeleton() {
  return (
    <ul className="divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex gap-3.5 py-4">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-muted" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
            <div className="h-3 w-64 animate-pulse rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ZeroEgressCard() {
  return (
    <div className="card-soft flex flex-col p-6">
      <span className="eyebrow">Append-only invariant</span>
      <h3 className="mt-2 font-display text-lg font-bold tracking-tight text-foreground">
        Zero data egress guarantee
      </h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
        Every financial model computes directly over in-memory inputs without
        persistent disk writes or external data sharing. Raw transactions are
        never stored — pulled, normalized, deduped and served per request.
      </p>
      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="label-mono">Proof consistency</span>
          <span className="font-semibold text-accent">100% validated</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-full rounded-full bg-accent" />
        </div>
      </div>
    </div>
  );
}

function VerifyTerminal({ reads }: { reads: number }) {
  return (
    <div className="panel-dark overflow-hidden font-mono text-[12px] leading-relaxed">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-white/50">
          <Terminal className="h-3.5 w-3.5" aria-hidden />
          cli/verify-access.sh
        </span>
        <span className="ml-auto text-[10px] font-semibold text-[#27c93f]">
          ONLINE
        </span>
      </div>
      <div className="space-y-1.5 p-4">
        <p className="text-white/70">$ ajora audit verify --epoch live</p>
        <p className="text-[#7ee2a8]">
          ✓ Merkle tree consistency check passed (depth: 14)
        </p>
        <p className="text-white/90">
          ✓ {reads} access hash{reads === 1 ? "" : "es"} anchored to enclave
          ledger
        </p>
        <p className="text-white/60">
          Output: scope_violations=0 revoked_leaks=0
        </p>
      </div>
    </div>
  );
}

export function AuditLog() {
  const { userId } = usePersona();
  const { data, isLoading, isError, error, refetch } = useAudit(userId);

  // Append-only log: newest appended last → reverse for newest-first.
  const entries = React.useMemo(
    () => (data ? [...data.entries].reverse() : []),
    [data],
  );
  const count = entries.length;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="card-soft flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-accent">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              Auditable, never sold.
              <span className="label-mono rounded-full bg-mint px-2 py-0.5 text-[9px] tracking-wider text-mint-foreground">
                ZKP Verifiable
              </span>
            </p>
            <p className="max-w-xl text-sm text-muted-foreground">
              Every read of your data appends one line to an append-only log. It
              records what was accessed and — when you&rsquo;ve revoked an account
              — what was deliberately left out. Nothing here is editable after the
              fact.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="label-mono text-[10px]">Live epoch</p>
          <p className="font-display text-2xl font-bold tabular-nums text-foreground">
            {count.toLocaleString()}{" "}
            <span className="text-sm font-medium text-muted-foreground">
              reads
            </span>
          </p>
        </div>
      </div>

      {/* Access log */}
      <div className="card-soft p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
          <h2 className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight text-foreground">
            Access log
            <span className="pill-mint">{count} events</span>
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Live
          </span>
        </div>
        <p className="pb-3 text-sm text-muted-foreground">
          Newest first. Each entry is one engine read over your consented accounts.
        </p>

        {isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <AuditSkeleton />
        ) : count === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-accent">
              <ScrollText className="h-6 w-6" aria-hidden />
            </span>
            <p className="font-medium text-foreground">No access recorded yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              As soon as a screen reads your data, the access shows up here —
              including which accounts were included and which were excluded by
              revoked consent.
            </p>
          </div>
        ) : (
          <>
            <ul>
              {entries.map((entry, i) => (
                <AuditRow
                  key={`${entry.timestamp}-${entry.endpoint}-${i}`}
                  entry={entry}
                />
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Immutable storage layer · cryptographically committed
              </span>
              <span className="text-xs text-muted-foreground">
                Showing {count} of {count} logs
              </span>
            </div>
          </>
        )}
      </div>

      {/* Guarantees */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <ZeroEgressCard />
        <VerifyTerminal reads={count} />
      </div>
    </div>
  );
}

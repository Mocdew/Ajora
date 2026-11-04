"use client";

import * as React from "react";
import {
  Scroll,
  Fingerprint,
  Vault,
  Prohibit,
  Wallet,
  Users,
  ShareNetwork,
  ListBullets,
  Pulse,
  CheckCircle,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { QueryError } from "@/components/query-error";
import { usePersona } from "@/components/persona-context";
import { useAudit, type AuditEntry } from "@/lib/api/trust";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/reveal";

const endpointMeta: Record<string, { label: string; icon: Icon }> = {
  cashflow: { label: "Cashflow engine", icon: Wallet },
  insights: { label: "Communal insights", icon: Users },
  graph: { label: "Relationship graph", icon: ShareNetwork },
  transactions: { label: "Transactions", icon: ListBullets },
  explanations: { label: "Explanations model", icon: Pulse },
  correction_confirm: { label: "Transfer match confirmed", icon: CheckCircle },
  correction_reject: { label: "Transfer match rejected", icon: XCircle },
};

function metaFor(endpoint: string) {
  return endpointMeta[endpoint] ?? { label: endpoint, icon: Pulse };
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

function AccountChip({ id, excluded = false }: { id: string; excluded?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs",
        excluded
          ? "bg-negative/10 text-negative line-through decoration-negative/50"
          : "bg-secondary text-muted-foreground",
      )}
    >
      {excluded ? <Prohibit className="h-3 w-3" aria-hidden /> : null}
      {id}
    </span>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const meta = metaFor(entry.endpoint);
  const Icon = meta.icon;
  const accessed = entry.accounts_accessed ?? [];
  const excluded = entry.revoked_excluded ?? [];
  const isWrite = entry.endpoint.startsWith("correction_");

  return (
    <li className="flex items-start gap-3 border-b border-border py-4 last:border-0">
      <div className="flex min-w-0 gap-4">
        <span className="panel-inset mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center text-accent">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-foreground">{meta.label}</span>
            <span className="badge-neutral">{isWrite ? "Write" : "Read"}</span>
            <time
              dateTime={entry.timestamp}
              className="font-mono text-xs tabular-nums text-muted-foreground"
            >
              {formatTs(entry.timestamp)}
            </time>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {accessed.length} account
              {accessed.length === 1 ? "" : "s"} accessed:
            </span>
            {accessed.length > 0 ? (
              accessed.map((id) => <AccountChip key={id} id={id} />)
            ) : (
              <span className="text-xs text-muted-foreground">none</span>
            )}
          </div>
          {excluded.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-negative">
                <Vault className="h-3 w-3" aria-hidden />
                Excluded by revoked consent:
              </span>
              {excluded.map((id) => (
                <AccountChip key={id} id={id} excluded />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function AuditSkeleton() {
  return (
    <ul className="divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex gap-4 py-4">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-secondary" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-4 w-48 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-64 animate-pulse rounded bg-secondary" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function NoStorageCard() {
  return (
    <div className="card-soft flex flex-col p-6">
      <span className="eyebrow">What is not stored</span>
      <h3 className="mt-2 text-lg font-bold tracking-tight text-foreground">
        Raw transactions are never kept
      </h3>
      <p className="mt-2 max-w-prose flex-1 text-sm text-muted-foreground">
        Each request pulls, normalises, dedups and classifies your transactions
        in memory and then discards them. The only durable records are this
        access log, your match corrections and your consent choices, each an
        append-only file.
      </p>
      <div className="panel-inset mt-4 flex items-center justify-between px-4 py-3 font-mono text-xs">
        <span className="text-muted-foreground">audit.jsonl</span>
        <span className="font-semibold text-accent">append-only</span>
      </div>
    </div>
  );
}

function LatestEntry({ entry }: { entry?: AuditEntry }) {
  return (
    <div className="card-soft flex flex-col p-6">
      <span className="eyebrow">Latest entry, as stored</span>
      <h3 className="mt-2 text-lg font-bold tracking-tight text-foreground">
        One line per read
      </h3>
      {entry ? (
        <pre className="panel-inset mt-4 flex-1 overflow-x-auto p-4 font-mono text-xs text-foreground">
          {JSON.stringify(entry, null, 2)}
        </pre>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          The newest log line appears here once a screen reads your data.
        </p>
      )}
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
          <span className="panel-inset inline-flex h-11 w-11 shrink-0 items-center justify-center text-accent">
            <Fingerprint className="h-5 w-5" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Auditable, never sold
            </p>
            <p className="max-w-prose text-sm text-muted-foreground">
              Every read of your data appends one line to this log. It records
              which accounts were accessed and, when you have revoked one, which
              were deliberately left out. Lines are only ever added, never
              edited.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="caption">Logged events</p>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {isLoading ? "–" : count.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Access log */}
      <Reveal className="card-soft p-6">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Access log
        </h2>
        <p className="mt-1 pb-3 text-sm text-muted-foreground">
          Newest first. Each entry is one engine read over your consented
          accounts, or one match correction you made.
        </p>

        {isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <AuditSkeleton />
        ) : count === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="panel-inset flex h-12 w-12 items-center justify-center text-accent">
              <Scroll className="h-6 w-6" aria-hidden />
            </span>
            <p className="font-medium text-foreground">No access recorded yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              As soon as a screen reads your data, the access shows up here,
              with the accounts that were included and any excluded by revoked
              consent.
            </p>
          </div>
        ) : (
          <ul>
            {entries.map((entry, i) => (
              <AuditRow
                key={`${entry.timestamp}-${entry.endpoint}-${i}`}
                entry={entry}
              />
            ))}
          </ul>
        )}
      </Reveal>

      {/* What is and isn't kept */}
      <Reveal className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <NoStorageCard />
        <LatestEntry entry={entries[0]} />
      </Reveal>
    </div>
  );
}

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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { QueryError } from "@/components/query-error";
import { usePersona } from "@/components/persona-context";
import { useAudit, type AuditEntry } from "@/lib/api/trust";
import { cn } from "@/lib/utils";

const endpointMeta: Record<string, { label: string; icon: LucideIcon }> = {
  cashflow: { label: "Cashflow", icon: Wallet },
  insights: { label: "Communal insights", icon: Users },
  graph: { label: "Relationship graph", icon: Share2 },
  transactions: { label: "Transactions", icon: ListTree },
};

function metaFor(endpoint: string) {
  return endpointMeta[endpoint] ?? { label: endpoint, icon: Activity };
}

const dateFmt = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "medium",
});

function formatTs(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

function AccountChip({
  id,
  excluded = false,
}: {
  id: string;
  excluded?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]",
        excluded
          ? "border-negative/30 bg-negative/10 text-negative line-through decoration-negative/50"
          : "border-border bg-muted/50 text-muted-foreground",
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

  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {/* timeline rail */}
      <div className="flex flex-col items-center">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="mt-1 w-px flex-1 bg-border last:hidden" aria-hidden />
      </div>

      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">{meta.label}</span>
          <span className="text-xs text-muted-foreground">read</span>
          <time
            dateTime={entry.timestamp}
            className="text-xs tabular-nums text-muted-foreground"
          >
            {formatTs(entry.timestamp)}
          </time>
        </div>

        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {entry.accounts_accessed.length} account
              {entry.accounts_accessed.length === 1 ? "" : "s"} accessed:
            </span>
            {entry.accounts_accessed.length > 0 ? (
              entry.accounts_accessed.map((id) => (
                <AccountChip key={id} id={id} />
              ))
            ) : (
              <span className="text-xs text-muted-foreground">none</span>
            )}
          </div>

          {hasExcluded ? (
            <div className="flex flex-wrap items-center gap-1.5">
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
    </li>
  );
}

function AuditSkeleton() {
  return (
    <ul className="space-y-6">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex gap-4">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
            <div className="h-3 w-64 animate-pulse rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AuditLog() {
  const { userId } = usePersona();
  const { data, isLoading, isError, error, refetch } = useAudit(userId);

  // Append-only log: newest is appended last → reverse for newest-first display.
  const entries = React.useMemo(
    () => (data ? [...data.entries].reverse() : []),
    [data],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-lg border border-teal/30 bg-teal/[0.06] p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Auditable, never sold.
          </p>
          <p className="text-sm text-muted-foreground">
            Every read of your data appends one line to an append-only log. It
            records what was accessed and — when you&rsquo;ve revoked an account
            — what was deliberately left out. Nothing here is editable after the
            fact.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Access log</CardTitle>
          <CardDescription>
            Newest first. Each entry is one engine read over your consented
            accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isError ? (
            <QueryError error={error} onRetry={() => refetch()} />
          ) : isLoading || !data ? (
            <AuditSkeleton />
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <ScrollText className="h-6 w-6" aria-hidden />
              </span>
              <p className="font-medium text-foreground">
                No access recorded yet
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                As soon as a screen reads your data, the access shows up here —
                including which accounts were included and which were excluded by
                revoked consent.
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
        </CardContent>
      </Card>
    </div>
  );
}

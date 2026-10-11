"use client";

import * as React from "react";
import {
  Building2,
  ShieldCheck,
  ShieldOff,
  Undo2,
  CheckCircle2,
  Link as LinkIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatTile } from "@/components/stat-tile";
import { QueryError } from "@/components/query-error";
import { usePersona } from "@/components/persona-context";
import {
  useConsents,
  useConsentMutation,
  type ConsentRecord,
} from "@/lib/api/trust";
import { cn } from "@/lib/utils";

/** "gtbank" → "GTBank", "opay" → "OPay", else Title Case. Derived, not hardcoded
 *  per persona, so new institutions render sensibly. */
function institutionLabel(institution: string): string {
  const known: Record<string, string> = {
    gtbank: "GTBank",
    access: "Access Bank",
    opay: "OPay",
    domv: "Domiciliary",
    kuda: "Kuda",
    uba: "UBA",
    zenith: "Zenith Bank",
  };
  if (known[institution]) return known[institution];
  return institution.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "gtb-b01" → "•••• b01" — a masked account reference from the id's tail. */
function maskAccount(accountId: string): string {
  const tail = accountId.split("-").pop() ?? accountId;
  return `•••• ${tail}`;
}

const dateFmt = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTs(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dateFmt.format(d);
}

type Banner = { tone: "revoked" | "granted"; text: string } | null;

function AccountsSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-md bg-muted" />
            <div className="space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="h-6 w-11 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ granted }: { granted: boolean }) {
  return granted ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-positive/30 bg-positive/10 px-2 py-0.5 text-xs font-semibold text-positive">
      <ShieldCheck className="h-3 w-3" aria-hidden />
      Consent granted
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-negative/30 bg-negative/10 px-2 py-0.5 text-xs font-semibold text-negative">
      <ShieldOff className="h-3 w-3" aria-hidden />
      Access revoked
    </span>
  );
}

function AccountRow({
  record,
  pending,
  onToggle,
}: {
  record: ConsentRecord;
  pending: boolean;
  onToggle: (next: boolean) => void;
}) {
  const granted = record.status === "granted";
  const grantedAt = formatTs(record.granted_at);
  const revokedAt = formatTs(record.revoked_at);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between",
        granted
          ? "border-border bg-card"
          : "border-dashed border-negative/30 bg-negative/[0.04]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
            granted
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
          aria-hidden
        >
          <Building2 className="h-5 w-5" />
        </span>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "font-medium text-foreground",
                !granted && "text-muted-foreground",
              )}
            >
              {institutionLabel(record.institution)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {maskAccount(record.account_id)}
            </span>
          </div>
          <StatusBadge granted={granted} />
          <p className="text-xs text-muted-foreground">
            {granted
              ? grantedAt
                ? `Granted ${grantedAt}`
                : "Consent granted"
              : revokedAt
                ? `Revoked ${revokedAt} — excluded from your cashflow & insights`
                : "Excluded from your cashflow & insights"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 self-end sm:self-center">
        <span
          className={cn(
            "text-xs font-medium",
            granted ? "text-positive" : "text-muted-foreground",
          )}
        >
          {granted ? "Sharing" : "Not sharing"}
        </span>
        <Toggle
          checked={granted}
          disabled={pending}
          onCheckedChange={onToggle}
          label={`${granted ? "Revoke" : "Grant"} consent for ${institutionLabel(
            record.institution,
          )} ${maskAccount(record.account_id)}`}
        />
        <button
          type="button"
          onClick={() => onToggle(!granted)}
          disabled={pending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
            granted
              ? "border-negative/30 text-negative hover:bg-negative/10"
              : "border-primary/40 text-primary hover:bg-primary/10",
          )}
        >
          {granted ? (
            <>
              <ShieldOff className="h-3.5 w-3.5" aria-hidden />
              Revoke
            </>
          ) : (
            <>
              <Undo2 className="h-3.5 w-3.5" aria-hidden />
              Grant
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export function ConnectedAccounts() {
  const { userId } = usePersona();
  const { data, isLoading, isError, error, refetch } = useConsents(userId);
  const mutation = useConsentMutation(userId);

  const [banner, setBanner] = React.useState<Banner>(null);
  const [confirm, setConfirm] = React.useState<ConsentRecord | null>(null);
  // The account_id a mutation is currently in-flight for (per-row pending).
  const pendingId = mutation.isPending
    ? mutation.variables?.accountId
    : undefined;

  const consents = data?.consents ?? [];
  const granted = consents.filter((c) => c.status === "granted").length;
  const revoked = consents.length - granted;

  function run(record: ConsentRecord, action: "revoke" | "grant") {
    const label = institutionLabel(record.institution);
    mutation.mutate(
      { accountId: record.account_id, action },
      {
        onSuccess: () => {
          setBanner(
            action === "revoke"
              ? {
                  tone: "revoked",
                  text: `Access revoked — ${label} removed from your cashflow & insights.`,
                }
              : {
                  tone: "granted",
                  text: `Access restored — ${label} is back in your cashflow & insights.`,
                },
          );
        },
      },
    );
  }

  function handleToggle(record: ConsentRecord, next: boolean) {
    if (next) {
      run(record, "grant"); // granting is non-destructive → immediate
    } else {
      setConfirm(record); // revoking is destructive-looking → confirm first
    }
  }

  return (
    <div className="space-y-6">
      {/* Accounts-contributing indicator — a bare KPI stat tile (dataviz: a single
          headline number is a stat tile, not a chart). Drops when an account is
          revoked; the down-delta shows the count removed (icon + sign, not color
          alone). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Accounts contributing"
          icon={<LinkIcon className="h-4 w-4" />}
          value={
            isLoading || !data ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="tabular-nums">
                {granted}
                <span className="text-xl text-muted-foreground"> / {consents.length}</span>
              </span>
            )
          }
          sublabel={
            revoked > 0
              ? "Revoked accounts are excluded from every figure"
              : "Every connected account feeds your cashflow & insights"
          }
          delta={
            revoked > 0
              ? {
                  value: `${revoked} revoked`,
                  direction: "down",
                  context: "not contributing",
                }
              : undefined
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connected accounts</CardTitle>
          <CardDescription>
            One row per linked bank or wallet. Consent is per-account and
            revocable — revoking drops that account out of your cashflow,
            insights and relationship graph immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {banner ? (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm",
                banner.tone === "revoked"
                  ? "border-negative/30 bg-negative/5 text-foreground"
                  : "border-positive/30 bg-positive/5 text-foreground",
              )}
            >
              {banner.tone === "revoked" ? (
                <ShieldOff
                  className="mt-0.5 h-4 w-4 shrink-0 text-negative"
                  aria-hidden
                />
              ) : (
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-positive"
                  aria-hidden
                />
              )}
              <span>{banner.text}</span>
            </div>
          ) : null}

          {mutation.isError ? (
            <QueryError
              error={mutation.error}
              onRetry={() => mutation.reset()}
              compact
            />
          ) : null}

          {isError ? (
            <QueryError error={error} onRetry={() => refetch()} />
          ) : isLoading || !data ? (
            <AccountsSkeleton />
          ) : consents.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              No accounts connected for this persona yet.
            </div>
          ) : (
            <div className="space-y-3">
              {consents.map((record) => (
                <AccountRow
                  key={record.account_id}
                  record={record}
                  pending={pendingId === record.account_id}
                  onToggle={(next) => handleToggle(record, next)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        tone="danger"
        title="Revoke this account's consent?"
        description={
          confirm ? (
            <>
              <span className="font-medium text-foreground">
                {institutionLabel(confirm.institution)}
              </span>{" "}
              <span className="font-mono text-xs">
                {maskAccount(confirm.account_id)}
              </span>{" "}
              will be removed from your cashflow, insights and relationship graph
              immediately. Nothing is deleted — you can grant access back at any
              time.
            </>
          ) : null
        }
        confirmLabel="Revoke access"
        cancelLabel="Keep sharing"
        pending={mutation.isPending}
        onConfirm={() => {
          if (confirm) run(confirm, "revoke");
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

"use client";

import * as React from "react";
import {
  Building2,
  Wallet,
  ShieldOff,
  Undo2,
  CheckCircle2,
  Plus,
  Lock,
  RefreshCw,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { QueryError } from "@/components/query-error";
import { usePersona } from "@/components/persona-context";
import {
  useConsents,
  useConsentMutation,
  type ConsentRecord,
} from "@/lib/api/trust";
import { cn } from "@/lib/utils";

const WALLETS = new Set(["opay", "palmpay", "kuda", "moniepoint", "paga"]);

function isWallet(institution: string): boolean {
  return WALLETS.has(institution.toLowerCase());
}

function institutionLabel(institution: string): string {
  const known: Record<string, string> = {
    gtbank: "GTBank",
    access: "Access Bank",
    opay: "OPay",
    palmpay: "PalmPay",
    domv: "Domiciliary",
    kuda: "Kuda",
    uba: "UBA",
    zenith: "Zenith Bank",
    moniepoint: "Moniepoint",
  };
  if (known[institution]) return known[institution];
  return institution.replace(/\b\w/g, (c) => c.toUpperCase());
}

function maskAccount(accountId: string): string {
  const tail = accountId.split("-").pop() ?? accountId;
  return `•••• ${tail}`;
}

function protocolLabel(institution: string): string {
  return isWallet(institution)
    ? "Merchant feed · webhook live"
    : "Protocol: OpenBanking-NG v2";
}

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
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
          className="flex items-center justify-between gap-4 rounded-xl border border-border p-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
            <div className="space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="h-6 w-11 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
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
  const Icon = isWallet(record.institution) ? Wallet : Building2;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between",
        granted ? "border-border bg-card" : "border-dashed border-negative/40 bg-negative/[0.03]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            granted ? "bg-secondary text-accent" : "bg-muted text-muted-foreground",
          )}
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "font-semibold text-foreground",
                !granted && "text-muted-foreground",
              )}
            >
              {institutionLabel(record.institution)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {maskAccount(record.account_id)}
            </span>
            {granted ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                Consent granted
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-negative">
                <ShieldOff className="h-3 w-3" aria-hidden />
                Access revoked
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {granted
              ? `${grantedAt ? `Granted ${grantedAt}` : "Consent granted"} · ${protocolLabel(record.institution)}`
              : revokedAt
                ? `Revoked ${revokedAt} — excluded from your cashflow & insights`
                : "Excluded from your cashflow & insights"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 self-end sm:self-center">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-medium",
              granted ? "text-foreground" : "text-muted-foreground",
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
        </div>
        <button
          type="button"
          onClick={() => onToggle(!granted)}
          disabled={pending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
            granted
              ? "border-negative/40 text-negative hover:bg-negative/10"
              : "border-accent/40 text-accent hover:bg-accent/10",
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

function SecurityEnvelope() {
  return (
    <div className="panel-dark flex flex-col p-6">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7ee2a8]">
        Security envelope
      </span>
      <h3 className="mt-2 font-display text-lg font-bold tracking-tight text-white">
        Zero-knowledge tokenized
      </h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-white/60">
        Your private keys and financial credentials never land in plaintext.
        Revoking immediately wipes ephemeral cache fragments across all
        aggregation nodes.
      </p>
      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-white/40">
            Revocation latency
          </p>
          <p className="font-display text-lg font-bold text-white">
            &lt; 420 <span className="text-sm font-medium text-white/60">ms</span>
          </p>
        </div>
        <span className="rounded-md bg-white/10 px-2 py-1 font-mono text-[10px] text-[#7ee2a8]">
          ED25519-SIGNED
        </span>
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
      run(record, "grant");
    } else {
      setConfirm(record);
    }
  }

  return (
    <div className="space-y-6">
      {/* Contributing summary + security envelope */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="card-soft flex flex-col p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <span className="label-mono pt-1">Accounts contributing</span>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Link new bank or wallet
            </button>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <span className="font-display text-[2.6rem] font-bold leading-none tabular-nums text-foreground">
              {isLoading || !data ? "—" : granted}
              <span className="text-2xl font-semibold text-muted-foreground">
                {" "}
                / {isLoading || !data ? "—" : consents.length}
              </span>
            </span>
            {!isLoading && data ? (
              <span className="pill-mint">
                {revoked === 0 ? "100% synced" : `${revoked} revoked`}
              </span>
            ) : null}
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden />
            {revoked > 0
              ? "Revoked accounts are excluded from every figure."
              : "Every connected account feeds your cashflow & insights with zero telemetry leakage."}
          </p>
          <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
            <span className="label-mono">Audit status</span>
            <span className="rounded-md bg-mint px-2 py-1 font-mono text-[10px] font-semibold text-mint-foreground">
              CHAIN_VERIFIED
            </span>
          </div>
        </div>

        <SecurityEnvelope />
      </div>

      {/* Connected accounts */}
      <div className="card-soft p-6">
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
          Connected accounts
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One row per linked bank or wallet. Consent is per-account and revocable
          — revoking drops that account out of your cashflow, insights and
          relationship graph immediately.
        </p>

        <div className="mt-5 space-y-3">
          {banner ? (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm",
                banner.tone === "revoked"
                  ? "border-negative/30 bg-negative/5 text-foreground"
                  : "border-accent/30 bg-mint/60 text-foreground",
              )}
            >
              {banner.tone === "revoked" ? (
                <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              )}
              <span>{banner.text}</span>
            </div>
          ) : null}

          {mutation.isError ? (
            <QueryError error={mutation.error} onRetry={() => mutation.reset()} compact />
          ) : null}

          {isError ? (
            <QueryError error={error} onRetry={() => refetch()} />
          ) : isLoading || !data ? (
            <AccountsSkeleton />
          ) : consents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-6 text-center text-sm text-muted-foreground">
              No accounts connected for this persona yet.
            </div>
          ) : (
            consents.map((record) => (
              <AccountRow
                key={record.account_id}
                record={record}
                pending={pendingId === record.account_id}
                onToggle={(next) => handleToggle(record, next)}
              />
            ))
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 p-3.5">
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 text-accent" aria-hidden />
            Continuous ledger reconciliation — last ping across all endpoints was
            moments ago. Latency nominal.
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/40"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Force re-sync
          </button>
        </div>
      </div>

      {/* Data storage & model privacy */}
      <DataPrivacyPanel />

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

/* Data-storage & model-privacy controls. Presentational guardrail surface that
 * restates the data-minimization posture; the toggles are local-only previews. */
function DataPrivacyPanel() {
  const [ephemeral, setEphemeral] = React.useState(true);

  return (
    <div className="card-soft p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-accent">
          <Lock className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
            Data storage &amp; model privacy
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Strict guardrails enforcing cryptographic isolation between your raw
            account transactions and the modeling layers.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/40 p-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              Ephemeral analysis only
              <span className="pill-mint text-[10px]">Recommended</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Never train models on your personal banking ledger. Cashflow
              inferences run in memory and compute outcomes per request.
            </p>
          </div>
          <Toggle
            checked={ephemeral}
            onCheckedChange={setEphemeral}
            label="Ephemeral analysis only"
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Data retention rules
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Transactions auto-purge from encrypted runtime caches after your
              selected rolling window.
            </p>
          </div>
          <span className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground">
            90 rolling days
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-negative/30 bg-negative/[0.04] p-4">
          <div>
            <p className="text-sm font-semibold text-negative">
              Complete account &amp; ledger purge
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Permanently revoke all bank access grants, wipe historical
              analytics, unlink shared communal circles and shred encryption keys.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-negative px-3.5 py-2 text-sm font-semibold text-negative-foreground transition-opacity hover:opacity-90"
          >
            Erase ledger data
          </button>
        </div>
      </div>
    </div>
  );
}

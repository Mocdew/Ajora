"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bank,
  Wallet,
  LinkBreak,
  ArrowCounterClockwise,
  CheckCircle,
  Plus,
  ArrowRight,
} from "@phosphor-icons/react/dist/ssr";
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
          className="panel-inset flex items-center justify-between gap-4 p-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-card" />
            <div className="space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-card" />
              <div className="h-3 w-40 animate-pulse rounded bg-card" />
            </div>
          </div>
          <div className="h-6 w-11 animate-pulse rounded-full bg-card" />
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
  const Icon = isWallet(record.institution) ? Wallet : Bank;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl p-4 transition-colors duration-300 sm:flex-row sm:items-center sm:justify-between",
        granted ? "bg-secondary" : "bg-negative/10",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            granted ? "bg-card text-accent" : "bg-card text-muted-foreground",
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
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                Consent granted
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-negative">
                <LinkBreak className="h-3 w-3" aria-hidden />
                Access revoked
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {granted
              ? `${grantedAt ? `Granted ${grantedAt}` : "Consent granted"} · ${isWallet(record.institution) ? "Wallet" : "Bank"} feed`
              : revokedAt
                ? `Revoked ${revokedAt}. Excluded from your cashflow & insights`
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
          className={granted ? "btn-danger" : "btn bg-accent/15 text-accent hover:bg-accent/25"}
        >
          {granted ? (
            <>
              <LinkBreak className="h-3.5 w-3.5" aria-hidden />
              Revoke
            </>
          ) : (
            <>
              <ArrowCounterClockwise className="h-3.5 w-3.5" aria-hidden />
              Grant
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function RevokeExplainer() {
  return (
    <div className="card-soft flex flex-col p-6">
      <span className="eyebrow">What revoking does</span>
      <h3 className="mt-2 text-lg font-bold tracking-tight text-foreground">
        Takes effect on the next read
      </h3>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">
        Every figure is recomputed over the accounts you still share. The
        revoked account is listed as excluded in the audit log. Nothing is
        deleted, so you can grant access back whenever you like.
      </p>
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
                  text: `Access revoked. ${label} is removed from your cashflow & insights.`,
                }
              : {
                  tone: "granted",
                  text: `Access restored. ${label} is back in your cashflow & insights.`,
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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card-soft flex flex-col p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <span className="caption pt-1">Accounts contributing</span>
            {/* aria-disabled (not disabled) keeps it focusable so the note
                explaining why is announced. */}
            <button
              type="button"
              aria-disabled="true"
              aria-describedby="link-account-note"
              onClick={(e) => e.preventDefault()}
              className="btn-primary cursor-not-allowed opacity-50 hover:bg-primary active:scale-100"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Link new bank or wallet
            </button>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <span className="text-4xl font-bold tabular-nums text-foreground">
              {isLoading || !data ? "—" : granted}
              <span className="text-2xl font-semibold text-muted-foreground">
                {" "}
                / {isLoading || !data ? "—" : consents.length}
              </span>
            </span>
            {!isLoading && data ? (
              <span className="badge">
                {revoked === 0 ? "All sharing" : `${revoked} revoked`}
              </span>
            ) : null}
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-accent" aria-hidden />
            {revoked > 0
              ? "Revoked accounts are excluded from every figure."
              : "Every connected account feeds your cashflow & insights."}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span id="link-account-note" className="caption">
              Linking needs a live Mono connection. This demo uses mock bank
              feeds.
            </span>
            <Link href="/audit" className="link-accent group">
              Consent changes are logged
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </div>
        </div>

        <RevokeExplainer />
      </div>

      {/* Connected accounts */}
      <div className="card-soft p-6">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Connected accounts
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One row per linked bank or wallet. Consent is per account, and revoking
          one drops it out of your cashflow, insights and relationship graph
          straight away.
        </p>

        <div className="mt-6 space-y-3">
          {banner ? (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "flex items-start gap-3 rounded-xl px-3 py-2 text-sm text-foreground animate-in fade-in duration-300",
                banner.tone === "revoked" ? "bg-negative/10" : "bg-accent/10",
              )}
            >
              {banner.tone === "revoked" ? (
                <LinkBreak className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden />
              ) : (
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
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
            <div className="panel-inset p-6 text-center text-sm text-muted-foreground">
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

      </div>

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
              immediately. Nothing is deleted, and you can grant access back at
              any time.
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

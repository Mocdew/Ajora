"use client";

import * as React from "react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  Clock3,
  Coins,
  Lightbulb,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type {
  CorrectionVerdict,
  EngineTransaction,
  MatchedTransfer,
} from "@/lib/api/engine-types";
import { cn, formatNaira } from "@/lib/utils";

function institutionLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAmount(transaction: EngineTransaction): string {
  if (transaction.currency === "NGN") return formatNaira(transaction.amount);
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: transaction.currency,
      maximumFractionDigits: 2,
    }).format(transaction.amount);
  } catch {
    return `${transaction.currency} ${transaction.amount.toLocaleString("en-NG")}`;
  }
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function timeGap(debit: string, credit: string): string {
  const milliseconds = new Date(credit).getTime() - new Date(debit).getTime();
  const minutes = Math.round(Math.abs(milliseconds) / 60_000);
  const amount =
    minutes < 60
      ? `${minutes} min`
      : minutes < 1_440
        ? `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)} hr`
        : `${(minutes / 1_440).toFixed(1)} days`;
  if (milliseconds === 0) return "Same time";
  return `${amount} ${milliseconds > 0 ? "later" : "earlier"}`;
}

function TransactionLeg({
  label,
  transaction,
}: {
  label: "Money out" | "Money in";
  transaction: EngineTransaction;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/25 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-display text-xl font-bold tabular-nums text-foreground">
        {formatAmount(transaction)}
      </p>
      <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        <p className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {institutionLabel(transaction.institution)} · {transaction.account_id}
          </span>
        </p>
        <p className="flex items-center gap-2">
          <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <time dateTime={transaction.timestamp}>
            {formatTimestamp(transaction.timestamp)}
          </time>
        </p>
      </div>
      {transaction.narration ? (
        <p className="mt-3 line-clamp-2 text-xs italic text-muted-foreground">
          “{transaction.narration}”
        </p>
      ) : null}
    </div>
  );
}

export function TransferPairCard({
  match,
  verdict,
  pending = false,
  error,
  onCorrection,
}: {
  match: MatchedTransfer;
  verdict?: CorrectionVerdict;
  pending?: boolean;
  error?: string;
  onCorrection?: (verdict: CorrectionVerdict) => void;
}) {
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const reasons = match.reasons ?? [];
  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
            {Math.round(match.score * 100)}% match
          </span>
          {match.cross_currency ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--chart-inflated)/0.35)] bg-[hsl(var(--chart-inflated)/0.1)] px-2.5 py-1 text-xs font-semibold text-foreground">
              <RefreshCw
                className="h-3.5 w-3.5 text-[hsl(var(--chart-inflated))]"
                aria-hidden
              />
              Cross-currency
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
            {timeGap(match.debit.timestamp, match.credit.timestamp)}
          </span>
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Coins className="h-3.5 w-3.5" aria-hidden />
            {formatNaira(match.fee)} fee/spread
          </span>
        </div>
      </div>

      <div className="grid items-center gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <TransactionLeg label="Money out" transaction={match.debit} />
        <div
          className={cn(
            "mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground",
            "rotate-90 md:rotate-0",
          )}
          aria-hidden
        >
          <ArrowRight className="h-4 w-4" />
        </div>
        <TransactionLeg label="Money in" transaction={match.credit} />
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground">
          <Lightbulb className="h-4 w-4 text-teal" aria-hidden />
          Why Ajora matched these
        </p>
        {reasons.length > 0 ? (
          <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
            {reasons.map((reason, index) => (
              <li key={`${reason}:${index}`} className="flex items-start gap-2">
                <span
                  className="mt-2 h-1 w-1 shrink-0 rounded-full bg-teal"
                  aria-hidden
                />
                {reason}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            The engine’s confidence score passed the matching threshold.
          </p>
        )}
      </div>

      {onCorrection ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          {verdict ? (
            <div
              role="status"
              className={cn(
                "flex items-start gap-2 text-sm",
                verdict === "confirm" ? "text-positive" : "text-negative",
              )}
            >
              {pending ? (
                <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : verdict === "confirm" ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              )}
              <span>
                <span className="font-semibold">
                  {pending
                    ? "Saving your review…"
                    : verdict === "confirm"
                      ? "Match confirmed"
                      : "Match rejected"}
                </span>
                {!pending ? (
                  <span className="block text-xs text-muted-foreground">
                    Recorded for audit and offline scorer improvement.
                  </span>
                ) : null}
              </span>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-foreground">
                {match.tier === "high"
                  ? "Is this automatic match correct?"
                  : "Does this look right?"}
              </p>
              <p className="text-xs text-muted-foreground">
                Your review becomes an auditable training signal.
              </p>
            </div>
          )}

          {!verdict ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onCorrection("confirm")}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Check className="h-4 w-4" aria-hidden />
                Confirm match
              </button>
              <button
                type="button"
                onClick={() => setRejectOpen(true)}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md border border-negative/30 bg-card px-3 py-2 text-sm font-semibold text-negative hover:bg-negative/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="h-4 w-4" aria-hidden />
                Reject
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-negative" role="alert">
          {error} Please try again.
        </p>
      ) : null}

      <ConfirmDialog
        open={rejectOpen}
        title="Reject this transfer match?"
        description="Ajora will append your correction to its audit trail and use it to improve the scorer offline. This feedback does not rewrite your current cashflow totals immediately."
        confirmLabel="Reject match"
        tone="danger"
        pending={pending}
        onConfirm={() => {
          setRejectOpen(false);
          onCorrection?.("reject");
        }}
        onCancel={() => setRejectOpen(false)}
      />
    </article>
  );
}

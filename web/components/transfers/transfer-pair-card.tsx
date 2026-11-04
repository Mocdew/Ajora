"use client";

import * as React from "react";
import {
  ArrowRight,
  SealCheck,
  Bank,
  Check,
  Clock,
  Coins,
  Lightbulb,
  CircleNotch,
  ArrowsClockwise,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type {
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
    <div className="panel-inset min-w-0 p-4">
      <p className="text-xs font-semibold text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold tabular-nums text-foreground">
        {formatAmount(transaction)}
      </p>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
        <p className="flex items-center gap-2">
          <Bank className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {institutionLabel(transaction.institution)} · {transaction.account_id}
          </span>
        </p>
        <p className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <time dateTime={transaction.timestamp}>
            {formatTimestamp(transaction.timestamp)}
          </time>
        </p>
      </div>
      {transaction.narration ? (
        <p className="mt-3 line-clamp-2 font-mono text-xs text-muted-foreground">
          {transaction.narration}
        </p>
      ) : null}
    </div>
  );
}

export function TransferPairCard({
  match, pending, disabled, onCorrection,
}: {
  match: MatchedTransfer;
  pending: boolean;
  disabled: boolean;
  onCorrection: (verdict: "confirm" | "reject") => void;
}) {
  const verdict = match.verdict;
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const reasons = match.reasons ?? [];
  return (
    <article className="card-soft p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge-neutral text-foreground">
            <SealCheck className="h-3.5 w-3.5" aria-hidden />
            {Math.round(match.score * 100)}% match
          </span>
          {match.cross_currency ? (
            <span className="badge-neutral text-foreground">
              <ArrowsClockwise className="h-3.5 w-3.5" aria-hidden />
              Cross-currency
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {timeGap(match.debit.timestamp, match.credit.timestamp)}
          </span>
          <span className="inline-flex items-center gap-2 tabular-nums">
            <Coins className="h-3.5 w-3.5" aria-hidden />
            {formatNaira(match.fee)} fee/spread
          </span>
        </div>
      </div>

      <div className="grid items-center gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <TransactionLeg label="Money out" transaction={match.debit} />
        <div
          className={cn(
            "mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground",
            "rotate-90 md:rotate-0",
          )}
          aria-hidden
        >
          <ArrowRight className="h-4 w-4" />
        </div>
        <TransactionLeg label="Money in" transaction={match.credit} />
      </div>

      <div className="panel-inset p-4">
        <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Lightbulb className="h-4 w-4 text-accent" aria-hidden />
          Why Ajora matched these
        </p>
        {reasons.length > 0 ? (
          <ul className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {reasons.map((reason, index) => (
              <li key={`${reason}:${index}`} className="flex items-start gap-2">
                <span
                  className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent"
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

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="status" className="text-sm">
          <p className="flex items-center gap-2 font-semibold">
            {pending ? <CircleNotch className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {pending ? "Saving your review…" : verdict === "confirm" ? "Match confirmed"
              : verdict === "reject" ? "Match rejected"
              : match.tier === "high" ? "Is this automatic match correct?"
              : "Is this a transfer between your own accounts?"}
          </p>
          <p className="text-xs text-muted-foreground">
            {verdict === "confirm" || (!verdict && match.tier === "high")
              ? "The transfer principal is excluded. Any fee stays in your cashflow."
              : "Both transactions count toward your cashflow until you confirm the match."}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onCorrection("confirm")}
            disabled={disabled || verdict === "confirm"} className="btn-primary">
            <Check className="h-4 w-4" aria-hidden />
            Confirm match
          </button>
          <button type="button" onClick={() => setRejectOpen(true)}
            disabled={disabled || verdict === "reject"} className="btn-danger">
            <X className="h-4 w-4" aria-hidden />
            Reject
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={rejectOpen}
        title="Reject this transfer match?"
        description="Both transactions will count toward your income and spending. Ajora will recalculate your insights and record your decision in the audit log."
        confirmLabel="Reject match"
        tone="danger"
        pending={pending}
        onConfirm={() => {
          setRejectOpen(false);
          onCorrection("reject");
        }}
        onCancel={() => setRejectOpen(false)}
      />
    </article>
  );
}

"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { EngineError } from "@/lib/api/engine";

/**
 * Friendly inline error with a retry — used by every data surface so a network
 * failure or a non-200 (incl. a 404 for an unknown persona) degrades to a small
 * recoverable card instead of a blank screen or a thrown overlay. `onRetry` is a
 * TanStack Query `refetch`.
 */
export function QueryError({
  error,
  onRetry,
  className,
  compact = false,
}: {
  error: unknown;
  onRetry: () => void;
  className?: string;
  compact?: boolean;
}) {
  const status = error instanceof EngineError ? error.status : undefined;
  const is404 = status === 404;

  const title = is404
    ? "No data for this persona"
    : status === 0 || status === undefined
      ? "Can’t reach the engine"
      : "Couldn’t load this view";

  const detail = is404
    ? "The engine has no record for the selected persona. Pick another from the switcher."
    : status === 0 || status === undefined
      ? "The analytics engine isn’t responding. Check it’s running, then retry."
      : error instanceof Error
        ? error.message
        : "Something went wrong.";

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-negative/30 bg-negative/5 p-4",
        compact && "p-3",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-negative"
          aria-hidden
        />
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground",
          "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        <RotateCw className="h-3.5 w-3.5" aria-hidden />
        Retry
      </button>
    </div>
  );
}

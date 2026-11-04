"use client";

import { Cpu } from "@phosphor-icons/react/dist/ssr";
import { useHealth } from "@/lib/api/health";
import { cn } from "@/lib/utils";

/** Live engine status from `/health`, not a hardcoded "online" label. */
export function EngineStatus() {
  const { isLoading, isError } = useHealth();
  const label = isLoading
    ? "Checking engine"
    : isError
      ? "Engine offline"
      : "Engine online";

  return (
    <div className="card-soft flex items-center gap-3 px-4 py-2">
      <span className="panel-inset inline-flex h-9 w-9 items-center justify-center text-accent">
        <Cpu className="h-4 w-4" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">
          Hungarian pairing
        </p>
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isError ? "bg-negative" : isLoading ? "bg-muted-foreground" : "bg-accent",
            )}
            aria-hidden
          />
          {label}
        </p>
      </div>
    </div>
  );
}

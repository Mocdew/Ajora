import { cn } from "@/lib/utils";

/**
 * Ajora logo — a near-black rounded tile with a white "A", next to the
 * "Ajora" wordmark. Matches the product header in the brand mockups.
 */
export function AjoraWordmark({
  className,
  showTagline = false,
}: {
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <span
        aria-hidden
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground"
      >
        A
      </span>
      <span className="inline-flex flex-col leading-none">
        <span className="text-xl font-bold tracking-tight text-foreground">
          Ajora
        </span>
        {showTagline ? (
          <span className="mt-1 text-xs font-medium text-muted-foreground">
            Your true cashflow
          </span>
        ) : null}
      </span>
    </span>
  );
}

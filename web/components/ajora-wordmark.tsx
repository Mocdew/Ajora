import { cn } from "@/lib/utils";

/**
 * Ajora wordmark — the gold, heavy-grotesque logotype from the deck.
 * The dot of the "j" is rendered as a gold disc accent, matching the cover.
 */
export function AjoraWordmark({
  className,
  showTagline = false,
}: {
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <span className={cn("inline-flex flex-col leading-none", className)}>
      <span className="font-display text-2xl font-bold tracking-tight text-accent">
        Ajora
      </span>
      {showTagline ? (
        <span className="mt-1 text-xs font-medium text-muted-foreground">
          Your true cashflow
        </span>
      ) : null}
    </span>
  );
}

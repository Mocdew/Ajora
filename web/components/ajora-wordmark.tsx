import { cn } from "@/lib/utils";

/** A circle mark and a compact, typographic wordmark. */
export function AjoraWordmark({
  className,
  showTagline = false,
}: {
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="h-7 w-7 text-foreground">
        <circle cx="16" cy="16" r="12.5" stroke="currentColor" strokeWidth="1.5" />
        <ellipse cx="16" cy="16" rx="5.5" ry="12.5" stroke="currentColor" strokeWidth="1.5" transform="rotate(40 16 16)" />
        <circle cx="25" cy="7" r="3" fill="currentColor" />
      </svg>
      <span className="inline-flex flex-col leading-none">
        <span className="text-[23px] font-semibold tracking-[0.12em] text-foreground">
          AJORA
        </span>
        {showTagline ? (
          <span className="mt-1 text-xs font-medium text-muted-foreground">
            Save together
          </span>
        ) : null}
      </span>
    </span>
  );
}

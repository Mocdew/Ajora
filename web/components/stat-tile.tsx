import * as React from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

type DeltaDirection = "up" | "down" | "flat";

export interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Short, muted caption above the value. */
  label: string;
  /** The headline figure — pre-formatted (e.g. "₦1.24m", "87%"). */
  value: React.ReactNode;
  /** Optional supporting line beneath the value. */
  sublabel?: string;
  /** Optional change indicator. Direction is shown with an icon + sign,
   * never color alone (accessibility: dataviz status rule). */
  delta?: {
    value: string;
    direction: DeltaDirection;
    /** e.g. "vs. last month". */
    context?: string;
  };
  /** Optional leading icon for the tile. */
  icon?: React.ReactNode;
}

const deltaStyles: Record<
  DeltaDirection,
  { icon: React.ElementType; className: string; srLabel: string }
> = {
  up: {
    icon: ArrowUpRight,
    className: "text-positive",
    srLabel: "increased by",
  },
  down: {
    icon: ArrowDownRight,
    className: "text-negative",
    srLabel: "decreased by",
  },
  flat: { icon: Minus, className: "text-muted-foreground", srLabel: "no change" },
};

/**
 * StatTile — a single KPI figure: muted label, large value, optional delta.
 *
 * Per the dataviz skill, a bare stat tile needs no plot/hover. Text wears ink
 * tokens; the delta pairs a direction icon and a sign with the status color so
 * meaning never rides on color alone.
 */
export function StatTile({
  label,
  value,
  sublabel,
  delta,
  icon,
  className,
  ...props
}: StatTileProps) {
  const deltaStyle = delta ? deltaStyles[delta.direction] : null;
  const DeltaIcon = deltaStyle?.icon;

  return (
    <Card className={cn("p-5", className)} {...props}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {icon ? (
          <span className="text-muted-foreground" aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2 text-sm">
        {delta && deltaStyle && DeltaIcon ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 font-medium",
              deltaStyle.className,
            )}
          >
            <DeltaIcon className="h-4 w-4" aria-hidden />
            <span className="sr-only">{deltaStyle.srLabel}</span>
            <span className="tabular-nums">{delta.value}</span>
          </span>
        ) : null}
        {delta?.context ? (
          <span className="text-muted-foreground">{delta.context}</span>
        ) : null}
        {!delta && sublabel ? (
          <span className="text-muted-foreground">{sublabel}</span>
        ) : null}
      </div>

      {delta && sublabel ? (
        <p className="mt-1 text-sm text-muted-foreground">{sublabel}</p>
      ) : null}
    </Card>
  );
}

"use client";

import * as React from "react";
import { formatNaira } from "@/lib/utils";

/**
 * Tweens between Naira values so a toggle feels like a reveal, not a cut.
 * Honors `prefers-reduced-motion` (snaps instantly) and always renders the
 * exact target value for screen readers via `aria-label`.
 */
export function AnimatedNaira({
  value,
  durationMs = 550,
  className,
  notation = "compact",
}: {
  value: number;
  durationMs?: number;
  className?: string;
  /** "compact" → ₦10.8m; "standard" → ₦10,830,000. */
  notation?: "compact" | "standard";
}) {
  const [display, setDisplay] = React.useState(value);
  const fromRef = React.useRef(value);
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic — fast settle, gentle landing.
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  const opts: Intl.NumberFormatOptions =
    notation === "compact"
      ? { notation: "compact", maximumFractionDigits: 2 }
      : {};

  return (
    <span className={className} aria-label={formatNaira(value, opts)}>
      <span aria-hidden>{formatNaira(display, opts)}</span>
    </span>
  );
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Rise-and-fade a section the first time it enters the viewport (700ms on the
 * base curve, see `.reveal` in globals.css). One IntersectionObserver per
 * element, disconnected after it fires; no scroll listeners. Reduced motion
 * drops the movement and keeps a plain fade.
 */
export function Reveal({
  as: Tag = "div",
  className,
  children,
  ...props
}: {
  as?: "div" | "section";
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      data-visible={visible}
      className={cn("reveal", className)}
      {...props}
    >
      {children}
    </Tag>
  );
}

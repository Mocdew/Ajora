"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fingerprint } from "@phosphor-icons/react/dist/ssr";
import { navItems } from "@/lib/nav";
import { cn } from "@/lib/utils";

// Literal classes so Tailwind emits them: links arrive 60ms apart (< 400ms total).
const STAGGER = [
  "[animation-delay:0ms]",
  "[animation-delay:60ms]",
  "[animation-delay:120ms]",
  "[animation-delay:180ms]",
  "[animation-delay:240ms]",
  "[animation-delay:300ms]",
];

export function Sidebar({
  className,
  staggered = false,
  onNavigate,
}: {
  className?: string;
  /** Mobile panel: links rise in one after another in reading order. */
  staggered?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn("flex h-full flex-col gap-1 p-4", className)}
    >
      {navItems.map((item, index) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-start gap-3 rounded-xl px-3 py-2 text-sm transition duration-300 active:scale-[0.98]",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground/70 hover:translate-x-0.5 hover:bg-secondary hover:text-foreground",
              staggered &&
                cn(
                  "animate-in fade-in slide-in-from-top-2 fill-mode-both duration-500 [animation-timing-function:cubic-bezier(0.22,1,0.36,1)]",
                  STAGGER[index] ?? STAGGER[STAGGER.length - 1],
                ),
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0 transition-colors duration-300",
                active
                  ? "text-primary-foreground"
                  : "text-muted-foreground group-hover:text-accent",
              )}
              aria-hidden
            />
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 font-semibold">
                {item.title}
                {item.comingSoon ? (
                  <span className="badge-neutral">Soon</span>
                ) : null}
              </span>
              <span
                className={cn(
                  "truncate text-xs",
                  active
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground",
                )}
              >
                {item.description}
              </span>
            </span>
          </Link>
        );
      })}

      <div className="panel-inset mt-auto flex items-start gap-3 p-3">
        <Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <div>
          <p className="text-xs font-semibold text-foreground">Consent-first</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Nothing collected &ldquo;just in case&rdquo;. You can revoke access
            at any time.
          </p>
        </div>
      </div>
    </nav>
  );
}

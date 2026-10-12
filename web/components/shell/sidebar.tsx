"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { navItems } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn("flex h-full flex-col gap-1 p-4", className)}
    >
      <p className="label-mono px-3 pb-3 pt-1">Navigation</p>

      {navItems.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm outline-none transition-all duration-200",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground/70 hover:translate-x-0.5 hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-[18px] w-[18px] shrink-0 transition-colors",
                active
                  ? "text-primary-foreground"
                  : "text-muted-foreground group-hover:text-accent",
              )}
              aria-hidden
            />
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 font-semibold tracking-tight">
                {item.title}
                {item.comingSoon ? (
                  <span className="label-mono rounded-full bg-muted px-1.5 py-0.5 text-[9px] tracking-wider">
                    Soon
                  </span>
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

      <div className="mt-auto flex items-start gap-2.5 rounded-xl border border-border bg-secondary/60 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <div>
          <p className="text-xs font-semibold text-foreground">Consent-first</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Nothing collected &ldquo;just in case&rdquo;. Access is revocable.
          </p>
        </div>
      </div>
    </nav>
  );
}

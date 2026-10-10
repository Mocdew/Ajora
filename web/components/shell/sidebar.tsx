"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex h-full flex-col gap-1 p-3",
        className,
      )}
    >
      <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Overview
      </p>
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
              "group flex items-start gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-foreground/75 hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-[18px] w-[18px] shrink-0",
                active ? "text-primary" : "text-muted-foreground",
              )}
              aria-hidden
            />
            <span className="flex flex-col">
              <span className="flex items-center gap-2 font-medium">
                {item.title}
                {item.comingSoon ? (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Soon
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">
                {item.description}
              </span>
            </span>
          </Link>
        );
      })}

      <div className="mt-auto rounded-md border border-border bg-muted/40 p-3">
        <p className="text-xs font-semibold text-foreground">
          Consent-first
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nothing collected &ldquo;just in case&rdquo;. Access is revocable and
          auditable.
        </p>
      </div>
    </nav>
  );
}

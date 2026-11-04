"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AjoraWordmark } from "@/components/ajora-wordmark";
import { AccountControl } from "@/components/shell/account-control";
import { PersonaSwitcher } from "@/components/shell/persona-switcher";
import { MobileNav } from "@/components/shell/mobile-nav";
import { navItems } from "@/lib/nav";
import { cn } from "@/lib/utils";

const insightLinks = [
  ["Overview", "/insights"],
  ["Transfers", "/transfers"],
  ["Relationships", "/communal"],
  ["Connections", "/connections"],
  ["Access history", "/audit"],
] as const;

export function TopBar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const analytics = ["/insights", "/transfers", "/communal", "/audit", "/overview", "/connections"].includes(pathname);
  return (
    <header className="workspace-header sticky top-0 z-30 border-b border-border before:absolute before:inset-0 before:-z-10 before:bg-background/95 before:backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between gap-3 px-5 sm:gap-4 sm:px-8 lg:px-12">
        <Link href="/dashboard" className="shrink-0 rounded-sm" aria-label="Ajora, go home">
          <AjoraWordmark className={analytics ? "[&>span]:hidden sm:[&>span]:inline-flex" : undefined} />
        </Link>
        <nav aria-label="Primary" className="workspace-nav hidden items-center gap-1 rounded-2xl border border-border bg-card p-1.5 lg:flex">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("rounded-[10px] px-4 py-2.5 text-[13px] transition-colors", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {analytics && <PersonaSwitcher />}
          <AccountControl onNavigate={() => setMobileMenuOpen(false)} />
          <MobileNav open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />
        </div>
      </div>
      {analytics && (
        <nav id="insights-navigation" aria-label="Financial insights" className="flex items-center gap-6 overflow-x-auto border-t border-border px-5 py-3 sm:justify-center sm:px-8">
          {insightLinks.map(([label, href]) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={cn("shrink-0 text-xs transition-colors", pathname === href ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>{label}</Link>
          ))}
        </nav>
      )}
    </header>
  );
}

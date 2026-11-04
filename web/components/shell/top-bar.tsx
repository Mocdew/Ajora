"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AjoraWordmark } from "@/components/ajora-wordmark";
import { PersonaSwitcher } from "@/components/shell/persona-switcher";
import { MobileNav } from "@/components/shell/mobile-nav";

export function TopBar() {
  const pathname = usePathname();
  const analytics = ["/insights", "/transfers", "/communal", "/audit", "/overview", "/connections"].includes(pathname);
  return (
    // The blur lives on a pseudo-element: backdrop-filter on the header itself
    // would trap the mobile nav's `position: fixed` panel inside the bar.
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border px-4 before:absolute before:inset-0 before:-z-10 before:bg-background/80 before:backdrop-blur-md md:px-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="rounded-lg"
          aria-label="Ajora, go home"
        >
          <AjoraWordmark />
        </Link>
        <span className="badge-neutral hidden sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          {analytics ? "Financial insights · Demo data" : "Ajo savings · Payment tracking"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {analytics ? <PersonaSwitcher /> : null}
        <MobileNav />
      </div>
    </header>
  );
}

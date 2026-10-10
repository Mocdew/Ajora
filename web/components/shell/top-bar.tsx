import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { AjoraWordmark } from "@/components/ajora-wordmark";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { PersonaSwitcher } from "@/components/shell/persona-switcher";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Ajora — go to dashboard"
        >
          <AjoraWordmark />
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
          <ShieldCheck className="h-3.5 w-3.5 text-teal" aria-hidden />
          Consent-first · demo data
        </span>
        <PersonaSwitcher />
        <ThemeToggle />
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          aria-hidden
        >
          P4
        </span>
      </div>
    </header>
  );
}

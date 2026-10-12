import Link from "next/link";
import { Search, Bell, User } from "lucide-react";
import { AjoraWordmark } from "@/components/ajora-wordmark";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { PersonaSwitcher } from "@/components/shell/persona-switcher";

function IconButton({
  label,
  dot,
  children,
}: {
  label: string;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}
      {dot ? (
        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-background" />
      ) : null}
    </button>
  );
}

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Ajora — go to dashboard"
        >
          <AjoraWordmark />
        </Link>
        <span className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1 sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          <span className="label-mono text-[10px] tracking-[0.16em] text-foreground/70">
            Consent-first · Live data
          </span>
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <PersonaSwitcher />
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <IconButton label="Search">
          <Search className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton label="Notifications" dot>
          <Bell className="h-[18px] w-[18px]" />
        </IconButton>
        <ThemeToggle />
        <span
          className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"
          aria-hidden
        >
          <User className="h-[18px] w-[18px]" />
        </span>
      </div>
    </header>
  );
}

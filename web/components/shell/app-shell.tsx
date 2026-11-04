import { TopBar } from "@/components/shell/top-bar";
import { Sidebar } from "@/components/shell/sidebar";

/**
 * AppShell — top bar + left sidebar + scrollable content region.
 * Below `md` the sidebar is replaced by the full-height mobile panel opened from
 * the top bar (see MobileNav).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main"
        className="btn-primary fixed left-4 top-4 z-50 -translate-y-16 focus-visible:translate-y-0"
      >
        Skip to content
      </a>
      <TopBar />
      <div className="mx-auto flex w-full max-w-[1440px]">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-72 shrink-0 overflow-y-auto border-r border-border md:block">
          <Sidebar />
        </aside>
        <main
          id="main"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 pb-12 pt-6 outline-none md:px-8 md:pb-16 md:pt-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

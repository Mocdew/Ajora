import { TopBar } from "@/components/shell/top-bar";

/**
 * A paper workspace with floating navigation and a mobile menu.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell min-h-dvh bg-background">
      <a
        href="#main"
        className="btn-primary fixed left-4 top-4 z-50 -translate-y-16 focus-visible:translate-y-0"
      >
        Skip to content
      </a>
      <TopBar />
      <div className="workspace-frame mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-[1280px] flex-col border-x border-border">
        <main
          id="main"
          tabIndex={-1}
          className="min-w-0 flex-1 px-5 py-10 outline-none sm:px-8 sm:py-12 lg:px-12 lg:py-14"
        >
          {children}
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-6 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground sm:px-8 lg:px-12">
          <span>Ajo / Esusu, made simple.</span>
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full border border-foreground/50" aria-hidden /> Your people. Your progress.</span>
        </footer>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { List, X } from "@phosphor-icons/react/dist/ssr";
import { Sidebar } from "@/components/shell/sidebar";
import { cn } from "@/lib/utils";

/**
 * Mobile navigation (below `md`): a menu button in the top bar that opens a
 * full-height panel under it. The panel renders right after the button so Tab
 * reaches the links next; focus moves into it on open, the page behind is made
 * inert, and Escape returns focus to the button. Closes on navigation, Escape,
 * a second tap, or the viewport widening past `md`.
 */
export function MobileNav() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Close whenever the route changes.
  React.useEffect(() => setOpen(false), [pathname]);

  React.useEffect(() => {
    if (!open) return;
    const close = (restoreFocus: boolean) => {
      setOpen(false);
      if (restoreFocus) buttonRef.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const wide = window.matchMedia("(min-width: 768px)");
    const onWide = () => {
      if (wide.matches) close(false);
    };

    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const main = document.getElementById("main");
    main?.setAttribute("inert", "");
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
      document.body.style.overflow = overflow;
      main?.removeAttribute("inert");
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? "mobile-nav-panel" : undefined}
        aria-label={open ? "Close menu" : "Open menu"}
        className="btn-icon relative"
      >
        <List
          className={cn(
            "absolute h-5 w-5 transition duration-500",
            open ? "rotate-90 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100",
          )}
          aria-hidden
        />
        <X
          className={cn(
            "absolute h-5 w-5 transition duration-500",
            open ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-75 opacity-0",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          ref={panelRef}
          id="mobile-nav-panel"
          className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto bg-background animate-in fade-in duration-300"
        >
          <Sidebar staggered onNavigate={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}

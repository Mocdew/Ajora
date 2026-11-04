"use client";

import * as React from "react";
import { CaretDown, Palette } from "@phosphor-icons/react/dist/ssr";
import {
  applyThemePreference,
  readThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match system" },
];

/** The appearance choice is saved per browser. */
export function ThemeSetting() {
  const [pref, setPref] = React.useState<ThemePreference>("light");

  React.useEffect(() => setPref(readThemePreference()), []);

  // Keep "Match system" live if the OS theme flips while the page is open.
  React.useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyThemePreference("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  return (
    <section
      aria-labelledby="appearance-heading"
      className="card-soft flex flex-wrap items-center justify-between gap-4 p-6"
    >
      <div className="flex items-start gap-3">
        <span className="panel-inset inline-flex h-10 w-10 shrink-0 items-center justify-center text-accent">
          <Palette className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 id="appearance-heading" className="text-base font-semibold text-foreground">
            Appearance
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Light, dark, or in step with your device. Your choice is saved in
            this browser.
          </p>
        </div>
      </div>
      <label className="relative inline-flex items-center">
        <span className="sr-only">Theme</span>
        <select
          value={pref}
          onChange={(e) => {
            const next = e.target.value as ThemePreference;
            setPref(next);
            applyThemePreference(next);
          }}
          className="h-11 appearance-none rounded-full border border-border bg-background py-2 pl-4 pr-9 text-sm font-medium text-foreground transition-colors duration-300 hover:bg-secondary"
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <CaretDown
          className="pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground"
          aria-hidden
        />
      </label>
    </section>
  );
}

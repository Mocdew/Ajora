/**
 * Theme preference. Dark is the default; light and "follow the system" are
 * opt-ins from Settings. Stored per browser under `ajora-theme`.
 */
export type ThemePreference = "dark" | "light" | "system";

export const THEME_STORAGE_KEY = "ajora-theme";

/** Resolve a preference to the concrete theme applied to <html>. */
export function resolveTheme(pref: ThemePreference): "dark" | "light" {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return pref;
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "system" || stored === "dark") {
      return stored;
    }
  } catch {
    // Storage blocked: fall through to the default.
  }
  return "dark";
}

export function applyThemePreference(pref: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  document.documentElement.classList.toggle(
    "dark",
    resolveTheme(pref) === "dark",
  );
}

/**
 * Runs in <head> before first paint so the page never flashes the wrong theme.
 * Also marks <html class="js"> so scroll reveals only hide content when JS runs.
 */
export const THEME_INIT_SCRIPT = `(function(){document.documentElement.classList.add("js");try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var light=p==="light"||(p==="system"&&matchMedia("(prefers-color-scheme: light)").matches);if(light)document.documentElement.classList.remove("dark");}catch(e){}})();`;

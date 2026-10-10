"use client";

import * as React from "react";

/**
 * Global persona selection.
 *
 * The engine is per-persona (`/users/{id}/…`), so one piece of state — the active
 * `userId` — drives every query on every route. The switcher in the top bar reads
 * the persona list from `/health` and flips this; all data hooks read it via
 * `usePersona()`.
 *
 * Default is `u_persona_a` (Adaeze) — the dedup hero (28.3% income inflation, clean
 * communal empty states). The choice is persisted to localStorage so a reload keeps
 * the demo where you left it.
 */

/** Fallback default until (and if) `/health` says otherwise. */
export const DEFAULT_PERSONA = "u_persona_a";

const STORAGE_KEY = "ajora.persona";

interface PersonaContextValue {
  userId: string;
  setUserId: (next: string) => void;
}

const PersonaContext = React.createContext<PersonaContextValue | null>(null);

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserIdState] = React.useState(DEFAULT_PERSONA);

  // Rehydrate the last-used persona on mount (client only).
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setUserIdState(saved);
    } catch {
      /* private mode / blocked storage — keep the default */
    }
  }, []);

  const setUserId = React.useCallback((next: string) => {
    setUserIdState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore — selection still works in-memory for this session */
    }
  }, []);

  const value = React.useMemo<PersonaContextValue>(
    () => ({ userId, setUserId }),
    [userId, setUserId],
  );

  return (
    <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>
  );
}

export function usePersona(): PersonaContextValue {
  const ctx = React.useContext(PersonaContext);
  if (!ctx) {
    throw new Error("usePersona must be used within a <PersonaProvider>");
  }
  return ctx;
}

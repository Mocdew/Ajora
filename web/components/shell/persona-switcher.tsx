"use client";

import * as React from "react";
import { Users, ChevronDown, AlertCircle } from "lucide-react";
import { useHealth } from "@/lib/api/health";
import { usePersona, DEFAULT_PERSONA } from "@/components/persona-context";
import { cn } from "@/lib/utils";

/** "u_persona_a" → "Persona A". Generic + deriveable from the id alone, so no
 *  persona names are hardcoded in the client. The real full name shows in each
 *  page header once that persona's data loads. */
function prettyPersona(id: string): string {
  const cleaned = id.replace(/^u_/, "").replace(/_/g, " ");
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Global persona selector (top bar). Populated from `/health`; flips the active
 * `userId` that every route's queries read. A native <select> keeps it keyboard-
 * and screen-reader-accessible for free.
 */
export function PersonaSwitcher() {
  const { userId, setUserId } = usePersona();
  const { data, isLoading, isError, refetch } = useHealth();

  const users = React.useMemo(() => data?.users ?? [], [data]);

  // If the persisted/default persona isn't in the served list, snap to the first.
  React.useEffect(() => {
    if (users.length > 0 && !users.includes(userId)) {
      setUserId(users.includes(DEFAULT_PERSONA) ? DEFAULT_PERSONA : users[0]);
    }
  }, [users, userId, setUserId]);

  if (isError) {
    return (
      <button
        type="button"
        onClick={() => refetch()}
        className="inline-flex items-center gap-1.5 rounded-md border border-negative/40 bg-negative/10 px-3 py-1.5 text-xs font-medium text-negative"
      >
        <AlertCircle className="h-3.5 w-3.5" aria-hidden />
        Engine offline — retry
      </button>
    );
  }

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Active persona</span>
      <Users
        className="pointer-events-none absolute left-2.5 h-4 w-4 text-teal"
        aria-hidden
      />
      <select
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        disabled={isLoading || users.length === 0}
        className={cn(
          "h-9 appearance-none rounded-md border border-border bg-card py-1.5 pl-8 pr-8 text-sm font-medium text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:opacity-60",
        )}
        aria-label="Select persona"
      >
        {isLoading ? (
          <option>Loading personas…</option>
        ) : (
          users.map((u) => (
            <option key={u} value={u}>
              {prettyPersona(u)}
            </option>
          ))
        )}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted-foreground"
        aria-hidden
      />
    </label>
  );
}

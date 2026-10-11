/**
 * Live engine client for Ajora.
 *
 * Every browser request goes to the same-origin proxy path `/api/engine/*`, which
 * the Next.js dev/prod server rewrites to the FastAPI engine (see next.config.ts).
 * Same-origin ⇒ no CORS, and the engine base stays a server-only env var.
 *
 * The engine is stateless and per-persona: every data endpoint lives under
 * `/users/{user_id}/…`. Query keys are therefore always keyed by `userId` so the
 * TanStack Query cache stays correct as the persona switcher changes the active
 * user.
 */

/** Same-origin proxy prefix. Resolves to `${AJORA_API_BASE}` server-side. */
export const ENGINE_BASE = "/api/engine";

/** A non-2xx response (incl. 404 for an unknown persona) or a parse failure. */
export class EngineError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

/** GET `path` (relative to the engine root) and parse JSON, mapping failures to
 *  an `EngineError` carrying the status + the engine's `detail` when present. */
export async function engineGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${ENGINE_BASE}${path}`, {
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    // Network error / proxy target down.
    throw new EngineError(
      0,
      err instanceof Error ? err.message : "Network request failed",
    );
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    throw new EngineError(res.status, detail);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new EngineError(res.status, "Malformed response from engine");
  }
}

/** POST to `path` (relative to the engine root) and parse the JSON body, mapping
 *  failures to an `EngineError` exactly like `engineGet`. Used by the consent
 *  revoke/grant mutations; the engine takes no request body for those. */
export async function enginePost<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${ENGINE_BASE}${path}`, {
      method: "POST",
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    throw new EngineError(
      0,
      err instanceof Error ? err.message : "Network request failed",
    );
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    throw new EngineError(res.status, detail);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new EngineError(res.status, "Malformed response from engine");
  }
}

/** Shared query keys — all data keys are per-persona so switching users never
 *  serves a stale persona's cache. */
export const engineKeys = {
  health: ["engine", "health"] as const,
  cashflow: (userId: string) => ["engine", "cashflow", userId] as const,
  transactions: (userId: string) => ["engine", "transactions", userId] as const,
  dashboard: (userId: string) => ["engine", "dashboard", userId] as const,
  insights: (userId: string) => ["engine", "insights", userId] as const,
  graph: (userId: string) => ["engine", "graph", userId] as const,
  consents: (userId: string) => ["engine", "consents", userId] as const,
  audit: (userId: string) => ["engine", "audit", userId] as const,
};

/**
 * Every per-persona engine query key for one user, in one place. The consent
 * mutations invalidate all of these on success so the dashboard, communal
 * insights, the connected-accounts list AND the audit log all recompute live
 * off the engine's now consent-scoped results — no reload. Keep in sync with the
 * keyed entries above.
 */
export function personaQueryKeys(userId: string) {
  return [
    engineKeys.cashflow(userId),
    engineKeys.transactions(userId),
    engineKeys.dashboard(userId),
    engineKeys.insights(userId),
    engineKeys.graph(userId),
    engineKeys.consents(userId),
    engineKeys.audit(userId),
  ] as const;
}

export interface HealthResponse {
  status: string;
  users: string[];
}

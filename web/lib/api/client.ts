/**
 * API client for Ajora.
 *
 * The live backend is the FastAPI app `api.main:app` (run from the repo root:
 * `.venv/bin/python -m uvicorn api.main:app --reload`), served at API_BASE_URL
 * (http://localhost:8000 by default; override with NEXT_PUBLIC_API_BASE_URL). It
 * exposes /users, /users/{id}/{transactions,cashflow,insights,graph,explanations}.
 * Most call sites still default to local stubs; set NEXT_PUBLIC_USE_LIVE_API=1 to
 * hit the service. The surface here is kept intentionally small so call sites (via
 * TanStack Query) don't change.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  // TODO: swap for the OpenAPI-generated typed client once the backend exists.
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    throw new ApiError(res.status, `Request failed: ${res.status} ${path}`);
  }
  return (await res.json()) as T;
}

/** Shared query keys so cache invalidation stays consistent. */
export const queryKeys = {
  dashboard: ["dashboard"] as const,
  transfers: ["transfers"] as const,
  communal: ["communal"] as const,
  audit: ["audit"] as const,
};

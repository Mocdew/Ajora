/**
 * Stub API client for Ajora.
 *
 * There is no live backend yet. When the FastAPI service and its
 * OpenAPI-generated types land, replace `request()` internals with the typed
 * client and point `API_BASE_URL` at the service. The surface here is kept
 * intentionally small so call sites (via TanStack Query) don't change.
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

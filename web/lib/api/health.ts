"use client";

import { useQuery } from "@tanstack/react-query";
import { engineGet, engineKeys, type HealthResponse } from "@/lib/api/engine";

/**
 * Liveness + the set of personas this engine instance can serve. Drives the
 * global persona switcher. Retries a little harder than the data queries because
 * the whole app is gated on knowing which personas exist.
 */
export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: engineKeys.health,
    queryFn: ({ signal }) => engineGet<HealthResponse>("/health", signal),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

export type { HealthResponse };

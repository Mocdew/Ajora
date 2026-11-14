"use client";

import { useQuery } from "@tanstack/react-query";
import { engineGet, engineKeys, type HealthResponse } from "@/lib/api/engine";

export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: engineKeys.health,
    queryFn: ({ signal }) => engineGet<HealthResponse>("/health", signal),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

export function useDemoPersonas() {
  return useQuery({
    queryKey: ["engine", "demo-personas"],
    queryFn: ({ signal }) => engineGet<{ id: string }[]>("/users", signal),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

export type { HealthResponse };

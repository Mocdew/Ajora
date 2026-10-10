"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api/client";
import {
  fetchCommunalStub,
  type CommunalResponse,
} from "@/lib/api/stub/communal";

/**
 * Communal-finance query.
 *
 * Today this resolves the local stub (`fetchCommunalStub`). When the FastAPI
 * insight engine exists, swap the `queryFn` for a call to the typed client, e.g.
 *
 *   queryFn: () => request<CommunalResponse>("/communal")
 *
 * Nothing else changes: the key, the return type, and every call site stay the
 * same (mirrors `useDashboard`).
 */
export function useCommunal() {
  return useQuery<CommunalResponse>({
    queryKey: queryKeys.communal,
    queryFn: fetchCommunalStub,
  });
}

export type { CommunalResponse };

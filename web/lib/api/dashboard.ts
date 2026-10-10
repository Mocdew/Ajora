"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api/client";
import {
  fetchDashboardStub,
  type DashboardResponse,
} from "@/lib/api/stub/dashboard";

/**
 * Dashboard query.
 *
 * Today this resolves the local stub (`fetchDashboardStub`). When the FastAPI
 * service exists, swap the `queryFn` for a call to the typed client, e.g.
 *
 *   queryFn: () => request<DashboardResponse>("/dashboard")
 *
 * Nothing else changes: the key, the return type, and every call site stay the
 * same.
 */
export function useDashboard() {
  return useQuery<DashboardResponse>({
    queryKey: queryKeys.dashboard,
    queryFn: fetchDashboardStub,
  });
}

export type { DashboardResponse };

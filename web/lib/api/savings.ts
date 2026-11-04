"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { engineGet, enginePost } from "./engine";

import type { components } from "./engine-schema";

export type SavingsSession = components["schemas"]["Session"];
export type CircleMember = components["schemas"]["Member"];
export type Circle = components["schemas"]["Circle"];
export type InvitationPreview = components["schemas"]["InvitationPreview"];

export function useSavingsSession() {
  return useQuery({
    queryKey: ["savings-session"],
    queryFn: ({ signal }) =>
      engineGet<SavingsSession>("/savings/session", signal),
    retry: false,
    refetchInterval: 10_000,
    refetchOnWindowFocus: "always",
  });
}
export function useCircles(userId: string) {
  return useQuery({
    queryKey: ["savings", userId, "circles"],
    queryFn: ({ signal }) => engineGet<Circle[]>("/savings/circles", signal),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}
export function useCircle(userId: string, id: string) {
  return useQuery({
    queryKey: ["savings", userId, "circles", id],
    queryFn: ({ signal }) =>
      engineGet<Circle>(`/savings/circles/${encodeURIComponent(id)}`, signal),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}
export function useSavingsAction<T = Circle>() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      enginePost<T>(`/savings${path}`, body ?? {}),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["savings"] });
    },
  });
}

export function useBankFeed(userId: string, id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["savings", userId, "bank-feed", id],
    queryFn: ({ signal }) =>
      engineGet<components["schemas"]["BankFeed"]>(
        `/savings/circles/${encodeURIComponent(id)}/bank-feed`,
        signal,
      ),
    enabled,
    refetchInterval: 10_000,
  });
}

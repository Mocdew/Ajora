"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { EngineError, engineGet, enginePost } from "./engine";

import type { components } from "./engine-schema";

export type SavingsSession = components["schemas"]["Session"];
export type CircleMember = components["schemas"]["Member"];
export type Circle = components["schemas"]["Circle"];
export type InvitationPreview = components["schemas"]["InvitationPreview"];

export async function replaceSavingsSession(
  client: QueryClient,
  identity: SavingsSession | null,
) {
  await Promise.all([
    client.cancelQueries({ queryKey: ["savings"] }),
    client.cancelQueries({ queryKey: ["savings-session"] }),
    client.cancelQueries({ queryKey: ["account-email"] }),
  ]);
  client.removeQueries({ queryKey: ["savings"] });
  client.removeQueries({ queryKey: ["account-email"] });
  if (identity) client.setQueryData(["savings-session"], identity);
  else await client.resetQueries({ queryKey: ["savings-session"] });
}

export function useSavingsLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await enginePost("/savings/logout", {});
      } catch (error) {
        if (!(error instanceof EngineError && error.status === 401)) throw error;
      }
    },
    onSuccess: () => replaceSavingsSession(client, null),
  });
}

export function useSavingsSession() {
  return useQuery({
    queryKey: ["savings-session"],
    queryFn: async ({ signal }) => {
      try {
        return await engineGet<SavingsSession>("/savings/session", signal);
      } catch (error) {
        // A checked, signed-out session is data so refreshes keep the form mounted.
        if (error instanceof EngineError && error.status === 401) return null;
        throw error;
      }
    },
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

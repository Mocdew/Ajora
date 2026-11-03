"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { engineGet, enginePost, engineKeys, type EngineError } from "@/lib/api/engine";
import type { components } from "./engine-schema";

type Schemas = components["schemas"];
export type ConsentRecord = Schemas["ConsentRecord"];
type ConsentsResponse = Schemas["ConsentsResponse"];
export type AuditEntry = Schemas["AuditEntry"];
type AuditResponse = Schemas["AuditResponse"];

// --- queries -----------------------------------------------------------------

/** Connected accounts + consent state for a persona (one row per account). */
export function useConsents(userId: string) {
  return useQuery<ConsentsResponse, EngineError>({
    queryKey: engineKeys.consents(userId),
    enabled: Boolean(userId),
    queryFn: ({ signal }) =>
      engineGet<ConsentsResponse>(
        `/users/${encodeURIComponent(userId)}/consents`,
        signal,
      ),
  });
}

/** The append-only access log for a persona (newest access appended last). */
export function useAudit(userId: string) {
  return useQuery<AuditResponse, EngineError>({
    queryKey: engineKeys.audit(userId),
    enabled: Boolean(userId),
    queryFn: ({ signal }) =>
      engineGet<AuditResponse>(
        `/users/${encodeURIComponent(userId)}/audit`,
        signal,
      ),
  });
}

// --- mutation ----------------------------------------------------------------

export type ConsentAction = "revoke" | "grant";

export function useConsentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, accountId, action }: {
      userId: string; accountId: string; action: ConsentAction;
    }) => enginePost<ConsentRecord>(
      `/users/${encodeURIComponent(userId)}/accounts/${encodeURIComponent(accountId)}/${action}`,
    ),
    // Reset (rather than mark stale) removes pre-revocation data immediately,
    // cancels older reads, and refetches active views. Even a lost POST response
    // may have changed the server's consent scope.
    onSettled: (_data, _error, { userId }) =>
      qc.resetQueries({ queryKey: engineKeys.persona(userId) }),
  });
}

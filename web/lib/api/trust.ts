"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  engineGet,
  enginePost,
  engineKeys,
  personaQueryKeys,
  type EngineError,
} from "@/lib/api/engine";

/**
 * Trust / consent surface — the one part of the app that *writes* to the engine.
 *
 * The engine persists consent + access to append-only files (no DB), so these
 * calls have real, durable effects: revoking an account recomputes every
 * downstream read (`cashflow`, `insights`, `graph`, `transactions`) over the
 * consented accounts only, and appends an audit entry. The hooks below therefore
 * invalidate *all* per-persona queries on success (see `invalidatePersona`) so
 * the dashboard, communal insights, the accounts list and the audit log update
 * live — no reload.
 *
 * Types are hand-written to match the verified live contract (the consent/audit
 * schemas are not yet in the generated `engine-schema.d.ts`; regenerate with
 * `npm run gen:api` to fold them in — the names here stay stable).
 */

export type ConsentStatus = "granted" | "revoked";

/** One connected account + its consent state (one row per account). */
export interface ConsentRecord {
  user_id: string;
  account_id: string;
  institution: string;
  status: ConsentStatus;
  granted_at: string; // ISO
  revoked_at: string | null; // ISO when revoked
}

export interface ConsentsResponse {
  user_id: string;
  consents: ConsentRecord[];
}

/** One line of the append-only access log. */
export interface AuditEntry {
  timestamp: string; // ISO
  user_id: string;
  endpoint: string; // "cashflow" | "insights" | "graph" | "transactions" | …
  accounts_accessed: string[];
  revoked_excluded: string[];
}

export interface AuditResponse {
  user_id: string;
  entries: AuditEntry[];
}

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

/** Invalidate every per-persona engine query so all surfaces recompute live. */
function invalidatePersona(qc: QueryClient, userId: string) {
  return Promise.all(
    personaQueryKeys(userId).map((queryKey) =>
      qc.invalidateQueries({ queryKey }),
    ),
  );
}

export type ConsentAction = "revoke" | "grant";

export interface ConsentMutationVars {
  accountId: string;
  action: ConsentAction;
}

/**
 * Revoke / grant one account's consent. Optimistically flips the cached consent
 * row so the toggle reacts instantly, reconciles with the returned
 * `ConsentRecord`, rolls back on error, and on success invalidates all
 * per-persona queries so the dashboard numbers + account count, communal
 * insights and the audit log all update live.
 */
export function useConsentMutation(userId: string) {
  const qc = useQueryClient();

  return useMutation<
    ConsentRecord,
    EngineError,
    ConsentMutationVars,
    { previous?: ConsentsResponse }
  >({
    mutationFn: ({ accountId, action }) =>
      enginePost<ConsentRecord>(
        `/users/${encodeURIComponent(userId)}/accounts/${encodeURIComponent(
          accountId,
        )}/${action}`,
      ),

    onMutate: async ({ accountId, action }) => {
      const key = engineKeys.consents(userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ConsentsResponse>(key);
      const nextStatus: ConsentStatus =
        action === "revoke" ? "revoked" : "granted";

      if (previous) {
        qc.setQueryData<ConsentsResponse>(key, {
          ...previous,
          consents: previous.consents.map((c) =>
            c.account_id === accountId ? { ...c, status: nextStatus } : c,
          ),
        });
      }
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(engineKeys.consents(userId), ctx.previous);
      }
    },

    onSuccess: (record) => {
      // Reconcile the single row with the authoritative server record…
      const key = engineKeys.consents(userId);
      const current = qc.getQueryData<ConsentsResponse>(key);
      if (current) {
        qc.setQueryData<ConsentsResponse>(key, {
          ...current,
          consents: current.consents.map((c) =>
            c.account_id === record.account_id ? record : c,
          ),
        });
      }
    },

    // …then refetch every surface so numbers + audit reflect the new scope.
    onSettled: () => invalidatePersona(qc, userId),
  });
}

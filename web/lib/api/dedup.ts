"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { engineGet, enginePost, engineKeys, type EngineError } from "@/lib/api/engine";
import type {
  CashflowResponse,
  CorrectionRecord,
  CorrectionRequest,
} from "@/lib/api/engine-types";

/** The complete read-only transfer-matching result for the review surface. */
export function useDedupReview(userId: string) {
  return useQuery<CashflowResponse, EngineError>({
    queryKey: engineKeys.dedupReview(userId),
    enabled: Boolean(userId),
    queryFn: ({ signal }) =>
      engineGet<CashflowResponse>(
        `/users/${encodeURIComponent(userId)}/cashflow`,
        signal,
      ),
  });
}

/** Verdicts belong to the engine and come back on each refreshed match. */
export function useSubmitCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...correction }: CorrectionRequest & { userId: string }) =>
      enginePost<CorrectionRecord>(
        `/users/${encodeURIComponent(userId)}/corrections`,
        correction,
      ),
    onSettled: (_data, _error, { userId }) =>
      qc.resetQueries({ queryKey: engineKeys.persona(userId) }),
  });
}

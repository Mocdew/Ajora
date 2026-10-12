"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { engineGet, engineKeys, type EngineError } from "@/lib/api/engine";
import { enginePost } from "@/lib/api/engine";
import type {
  CashflowResponse,
  CorrectionRecord,
  CorrectionRequest,
  CorrectionVerdict,
} from "@/lib/api/engine-types";

interface PersonaCorrectionState {
  verdicts: Record<string, CorrectionVerdict>;
  pending: Record<string, boolean>;
  errors: Record<string, string>;
}

const EMPTY_CORRECTION_STATE: PersonaCorrectionState = {
  verdicts: {},
  pending: {},
  errors: {},
};

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

/**
 * Append confirm/reject feedback and expose an optimistic verdict map for the
 * current persona. Corrections are training signals; they do not rewrite the
 * current cashflow result, so only the audit query needs refreshing afterward.
 */
export function useSubmitCorrection(userId: string) {
  const queryClient = useQueryClient();
  const [local, setLocal] = React.useState<
    Record<string, PersonaCorrectionState>
  >({});
  const current = local[userId] ?? EMPTY_CORRECTION_STATE;

  const mutation = useMutation<
    CorrectionRecord,
    EngineError,
    CorrectionRequest,
    { previous?: CorrectionVerdict }
  >({
    mutationFn: (correction) =>
      enginePost<CorrectionRecord>(
        `/users/${encodeURIComponent(userId)}/corrections`,
        correction,
      ),
    onMutate: (correction) => {
      const previous = current.verdicts[correction.match_id];
      setLocal((all) => {
        const persona = all[userId] ?? EMPTY_CORRECTION_STATE;
        const errors = { ...persona.errors };
        delete errors[correction.match_id];
        return {
          ...all,
          [userId]: {
            verdicts: {
              ...persona.verdicts,
              [correction.match_id]: correction.verdict,
            },
            pending: { ...persona.pending, [correction.match_id]: true },
            errors,
          },
        };
      });
      return { previous };
    },
    onError: (error, correction, context) => {
      setLocal((all) => {
        const persona = all[userId] ?? EMPTY_CORRECTION_STATE;
        const verdicts = { ...persona.verdicts };
        const pending = { ...persona.pending };
        if (context?.previous) verdicts[correction.match_id] = context.previous;
        else delete verdicts[correction.match_id];
        delete pending[correction.match_id];
        return {
          ...all,
          [userId]: {
            verdicts,
            pending,
            errors: { ...persona.errors, [correction.match_id]: error.message },
          },
        };
      });
    },
    onSuccess: (record) => {
      setLocal((all) => {
        const persona = all[userId] ?? EMPTY_CORRECTION_STATE;
        const pending = { ...persona.pending };
        const errors = { ...persona.errors };
        delete pending[record.match_id];
        delete errors[record.match_id];
        return {
          ...all,
          [userId]: {
            verdicts: {
              ...persona.verdicts,
              [record.match_id]: record.verdict,
            },
            pending,
            errors,
          },
        };
      });
      queryClient.invalidateQueries({ queryKey: engineKeys.audit(userId) });
    },
  });

  return {
    ...mutation,
    verdicts: current.verdicts,
    pendingByMatchId: current.pending,
    errorsByMatchId: current.errors,
  };
}

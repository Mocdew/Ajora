"use client";

import { useQuery } from "@tanstack/react-query";
import { engineGet, engineKeys } from "@/lib/api/engine";
import type { components } from "./engine-schema";

export type Explanation = components["schemas"]["ExplanationItem"];
export type ExplanationsResponse = components["schemas"]["ExplanationsResponse"];

export function useExplanations(userId: string) {
  return useQuery({
    queryKey: engineKeys.explanations(userId),
    queryFn: ({ signal }) =>
      engineGet<ExplanationsResponse>(
        `/users/${encodeURIComponent(userId)}/explanations`,
        signal,
      ),
  });
}

/**
 * The grounded narration for one communal relationship, keyed
 * `"{relationship_type}:{counterparty}"` in the explanations map. Returns undefined
 * when the key is absent or the narration failed grounding, so callers fall back to
 * their client-composed sentence.
 */
export function communalNarration(
  data: ExplanationsResponse | undefined,
  ins: { relationship_type: string; counterparty: string },
): Explanation | undefined {
  const exp = data?.explanations[`${ins.relationship_type}:${ins.counterparty}`];
  return exp?.grounded ? exp : undefined;
}

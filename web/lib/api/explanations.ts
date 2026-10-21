"use client";

import { useQuery } from "@tanstack/react-query";
import { engineGet } from "@/lib/api/engine";
import {
  DEMO_USER_ID,
  type Explanation,
  type ExplanationsResponse,
} from "@/lib/api/stub/explanations";

/**
 * Grounded-explanation query — live.
 *
 * Calls `GET /users/{id}/explanations` through the same-origin `/api/engine` proxy
 * (see next.config.ts), so the browser never touches the engine's CORS-pinned origin
 * directly — same path the dashboard/communal queries use. The endpoint runs the real
 * dedup engine + GenAI explainer and returns grounding-checked, camelCase narration
 * (matching `ExplanationsResponse`); when the server has no ANTHROPIC_API_KEY it returns
 * the deterministic offline narration (`generatedBy: "stub-offline"`) instead — still
 * built from real engine figures. Key, return type and call sites are unchanged
 * (mirrors `useDashboard` / `useCommunal`), and the caller hides the block on error.
 */
export function useExplanations(userId: string = DEMO_USER_ID) {
  return useQuery<ExplanationsResponse>({
    queryKey: ["explanations", userId] as const,
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

export type { ExplanationsResponse, Explanation };
export { DEMO_USER_ID };

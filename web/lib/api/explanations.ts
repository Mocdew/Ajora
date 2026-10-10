"use client";

import { useQuery } from "@tanstack/react-query";
import { engineGet } from "@/lib/api/engine";
import {
  DEMO_USER_ID,
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

export type { ExplanationsResponse };
export { DEMO_USER_ID };

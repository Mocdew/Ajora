/**
 * Stub explanations payload for Ajora.
 *
 * Mirrors the shape the FastAPI service returns from
 * `GET /users/{id}/explanations`, so the UI can render the grounded LLM narration
 * before/without the backend running. When the service is up, point the query at it
 * (see `lib/api/explanations.ts`) — the exported types and the hook keep call sites
 * unchanged (same pattern as `stub/dashboard.ts` and `stub/communal.ts`).
 *
 * ── What this is ─────────────────────────────────────────────────────────────
 * The narration is produced by the GenAI explainer from REAL dedup-engine output
 * (`backend/app/explainer`), then verified so every number in it is one the engine
 * actually computed — no figure is invented. The strings below are the exact,
 * deterministic output of that pipeline for each demo persona, captured verbatim, so
 * the stub and the live endpoint read identically.
 *
 * Today only the `dedup` insight has real engine output (the communal-finance
 * classifier isn't built yet). The response is a keyed map so communal narration slots
 * in unchanged once that lands.
 */

/** One grounded explanation for a single insight. */
export interface Explanation {
  /** Which insight this narrates — "dedup" today; "ajo" | "dependents" | … later. */
  insightKey: string;
  /** The user-facing sentence(s), generated from engine output and grounding-checked. */
  narration: string;
  /** True when every number cited is traceable to the engine's figures. */
  grounded: boolean;
}

export interface ExplanationsResponse {
  userId: string;
  userName: string;
  /** Which client produced the narration: a model id, or "stub-offline". */
  generatedBy: string;
  /** Keyed by insight — `dedup` is always present today. */
  explanations: Record<string, Explanation>;
}

/** The demo user the dashboard narrates. Override with NEXT_PUBLIC_DEMO_USER_ID. */
export const DEMO_USER_ID =
  process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "u_persona_b";

const NARRATION: Record<string, { userName: string; narration: string }> = {
  u_demo_stephen: {
    userName: "Stephen Vincent",
    narration:
      "Stephen, we found 3 transfer(s) you made between your own banks, moving ₦254,982.50 in total. That money is not new income or new spending, so counting it inflated your income by 44.3%. Your real income is ₦576,000, not the ₦830,965 a naive view shows. The largest move, ₦149,975 from gtbank to kuda, is a high-confidence match (98%).",
  },
  u_persona_a: {
    userName: "Adaeze Okonkwo",
    narration:
      "Adaeze, we found 5 transfer(s) you made between your own banks, moving ₦639,980 in total. That money is not new income or new spending, so counting it inflated your income by 28.3%. Your real income is ₦2,264,700, not the ₦2,904,660 a naive view shows. The largest move, ₦150,000 from gtbank to kuda, is a high-confidence match (98%).",
  },
  u_persona_b: {
    userName: "Emeka Balogun",
    narration:
      "Emeka, we found 8 transfer(s) you made between your own banks, moving ₦1,392,065 in total. That money is not new income or new spending, so counting it inflated your income by 24.9%. Your real income is ₦5,595,250, not the ₦6,986,880 a naive view shows. The largest move, ₦200,000 from gtbank to opay, is a high-confidence match (98%).",
  },
  u_persona_c: {
    userName: "Funmilayo Adeyemi",
    narration:
      "Funmilayo, we found 2 transfer(s) you made between your own banks, moving ₦79,990 in total. That money is not new income or new spending, so counting it inflated your income by 7.8%. Your real income is ₦1,021,200, not the ₦1,101,180 a naive view shows. The largest move, ₦45,000 from gtbank to opay, is a high-confidence match (98%).",
  },
};

export function fetchExplanationsStub(
  userId: string = DEMO_USER_ID,
): Promise<ExplanationsResponse> {
  const entry = NARRATION[userId] ?? NARRATION[DEMO_USER_ID];
  return new Promise((resolve) => {
    setTimeout(
      () =>
        resolve({
          userId,
          userName: entry.userName,
          generatedBy: "stub-offline",
          explanations: {
            dedup: { insightKey: "dedup", narration: entry.narration, grounded: true },
          },
        }),
      350,
    );
  });
}

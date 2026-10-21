/**
 * Stub explanations payload for Ajora.
 *
 * Mirrors the shape the FastAPI service returns from
 * `GET /users/{id}/explanations`, so the UI can render the grounded LLM narration
 * before/without the backend running. The live hook (`lib/api/explanations.ts`) imports
 * its types from here, so call sites stay unchanged whichever source serves the data.
 *
 * ── What this is ─────────────────────────────────────────────────────────────
 * The narration is produced by the GenAI explainer from REAL dedup-engine output
 * (`engine/explainer`), then verified so every number in it is one the engine
 * actually computed — no figure is invented. The strings below are the exact,
 * deterministic output of that pipeline for each demo persona, captured verbatim, so
 * the stub and the live endpoint read identically.
 *
 * The map always carries `dedup`, plus one entry per communal relationship the
 * classifier found, keyed `"{relationship_type}:{counterparty}"` (e.g.
 * `"dependent:MAMA EMEKA"`) — the same key the communal cards look up. Personas with
 * no communal relationships (Adaeze, Stephen) carry only `dedup`. Like the live
 * endpoint, every stub entry is grounded.
 */

/** One grounded explanation for a single insight. */
export interface Explanation {
  /** Which insight this narrates — "dedup", or "{relationship_type}:{counterparty}". */
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
  /** Keyed by insight — `dedup` always, plus one key per communal relationship. */
  explanations: Record<string, Explanation>;
}

/** The demo user the dashboard narrates. Override with NEXT_PUBLIC_DEMO_USER_ID. */
export const DEMO_USER_ID =
  process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "u_persona_b";

const NARRATION: Record<
  string,
  { userName: string; explanations: Record<string, string> }
> = {
  u_demo_stephen: {
    userName: "Stephen Vincent",
    explanations: {
      dedup:
        "Stephen, we found 3 transfer(s) you made between your own banks, moving ₦254,982.50 in total. That money is not new income or new spending, so counting it inflated your income by 44.3%. Your real income is ₦576,000, not the ₦830,965 a naive view shows. The largest move, ₦149,975 from gtbank to kuda, is a high-confidence match (98%).",
    },
  },
  u_persona_a: {
    userName: "Adaeze Okonkwo",
    explanations: {
      dedup:
        "Adaeze, we found 5 transfer(s) you made between your own banks, moving ₦639,980 in total. That money is not new income or new spending, so counting it inflated your income by 28.3%. Your real income is ₦2,264,700, not the ₦2,904,660 a naive view shows. The largest move, ₦150,000 from gtbank to kuda, is a high-confidence match (98%).",
    },
  },
  u_persona_b: {
    userName: "Emeka Balogun",
    explanations: {
      dedup:
        "Emeka, we found 8 transfer(s) you made between your own banks, moving ₦1,392,065 in total. That money is not new income or new spending, so counting it inflated your income by 24.9%. Your real income is ₦5,595,250, not the ₦6,986,880 a naive view shows. The largest move, ₦200,000 from gtbank to opay, is a high-confidence match (98%).",
      "remittance:CHIOMA BALOGUN":
        "Emeka, you receive remittances from CHIOMA BALOGUN — 3 transfer(s) totalling ₦2,557,500 on a quarterly basis. That is about 45.71% of your real income.",
      "dependent:MAMA EMEKA":
        "Emeka, you regularly support MAMA EMEKA — 5 transfer(s) totalling ₦250,000 on a monthly basis. This is steady, recurring support, not one-off spending. That is about 4.47% of your real income.",
    },
  },
  u_persona_c: {
    userName: "Funmilayo Adeyemi",
    explanations: {
      dedup:
        "Funmilayo, we found 2 transfer(s) you made between your own banks, moving ₦79,990 in total. That money is not new income or new spending, so counting it inflated your income by 7.8%. Your real income is ₦1,021,200, not the ₦1,101,180 a naive view shows. The largest move, ₦45,000 from gtbank to opay, is a high-confidence match (98%).",
      "dependent:TUNDE ADEYEMI":
        "Funmilayo, you regularly support TUNDE ADEYEMI — 4 transfer(s) totalling ₦120,000 on a monthly basis. This is steady, recurring support, not one-off spending. That is about 11.75% of your real income.",
      "informal_lending:CHIDI OKEKE":
        "Funmilayo, you lent money to CHIDI OKEKE: ₦50,000 out and ₦20,000 repaid so far, leaving ₦30,000 still owed to you. Ajora tracks this as a loan rather than spending, so your real position is not understated.",
      "ajo_esusu:IYABO ADISA":
        "Funmilayo, you contribute to an ajo/esusu savings group with IYABO ADISA — 5 contribution(s) totalling ₦80,000. You have received ₦80,000 back in payout(s). That is about 7.83% of your real income.",
    },
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
          explanations: Object.fromEntries(
            Object.entries(entry.explanations).map(([insightKey, narration]) => [
              insightKey,
              { insightKey, narration, grounded: true },
            ]),
          ),
        }),
      350,
    );
  });
}

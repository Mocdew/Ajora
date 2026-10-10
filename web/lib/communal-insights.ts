/**
 * Presentation helpers for communal insights — pure, framework-free, shared by the
 * /communal insight cards and the dashboard's communal preview. Every figure comes
 * straight from the engine's `CommunalInsight`; nothing is recomputed here beyond
 * phrasing and direction.
 */

import { formatNaira } from "@/lib/utils";
import type { CommunalInsight, RelationshipType } from "@/lib/api/engine-types";

/** Money flow relative to the user — drives card accent + flow chip, graph color. */
export type Flow = "in" | "out" | "neutral";

export const RELATIONSHIP_LABEL: Record<RelationshipType, string> = {
  ajo_esusu: "Ajo / esusu",
  dependent: "Dependents · black tax",
  informal_lending: "Informal lending",
  remittance: "Remittances",
};

/** Title-case an UPPERCASE engine counterparty ("TUNDE ADEYEMI" → "Tunde Adeyemi"). */
export function prettyName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Which way the money predominantly moves for this relationship. */
export function insightFlow(ins: CommunalInsight): Flow {
  switch (ins.relationship_type) {
    case "dependent":
      return "out";
    case "ajo_esusu":
      // Rotating savings: contribution out, payout back — nets ≈ 0 → two-way.
      return Math.abs(ins.net_position_ngn) < 1 ? "neutral" : ins.net_position_ngn > 0 ? "out" : "in";
    case "informal_lending":
      // Positive net = counterparty still owes you → asset to you (in).
      return ins.net_position_ngn >= 0 ? "in" : "out";
    case "remittance":
      return ins.total_in_ngn >= ins.total_out_ngn ? "in" : "out";
    default:
      return "neutral";
  }
}

export interface Headline {
  value: number;
  suffix: string;
}

/** The big figure + its qualifier for a card headline. */
export function insightHeadline(ins: CommunalInsight): Headline {
  switch (ins.relationship_type) {
    case "dependent":
      return { value: ins.total_out_ngn, suffix: "sent" };
    case "ajo_esusu":
      return { value: ins.total_out_ngn, suffix: "contributed" };
    case "informal_lending":
      return {
        value: Math.abs(ins.net_position_ngn),
        suffix: ins.net_position_ngn >= 0 ? "outstanding" : "you owe",
      };
    case "remittance": {
      const inbound = ins.total_in_ngn >= ins.total_out_ngn;
      return {
        value: inbound ? ins.total_in_ngn : ins.total_out_ngn,
        suffix: inbound ? "received" : "sent",
      };
    }
    default:
      return { value: Math.abs(ins.net_position_ngn), suffix: "" };
  }
}

const pctClause = (pct: number) =>
  pct > 0 ? ` — ${pct.toFixed(1)}% of your net income` : "";

/** The deck-phrased human sentence for an insight. */
export function composeInsightSentence(ins: CommunalInsight): string {
  const name = prettyName(ins.counterparty);
  const cadence = ins.cadence === "one-off" ? "" : `${ins.cadence} `;

  switch (ins.relationship_type) {
    case "dependent":
      return `${formatNaira(ins.total_out_ngn)} supports ${name} across ${ins.count} ${cadence}transfers${pctClause(ins.pct_of_net_income)}.`;
    case "ajo_esusu":
      return `${formatNaira(ins.total_out_ngn)} contributed to ${name}'s ajo and ${formatNaira(ins.total_in_ngn)} collected back — a balanced rotating-savings circle over ${ins.count} ${cadence}moves.`;
    case "informal_lending":
      return ins.net_position_ngn >= 0
        ? `You lent ${name} ${formatNaira(ins.total_out_ngn)}; ${formatNaira(ins.total_in_ngn)} has come back, leaving ${formatNaira(ins.net_position_ngn)} still owed to you.`
        : `You owe ${name} ${formatNaira(Math.abs(ins.net_position_ngn))} — borrowed ${formatNaira(ins.total_in_ngn)}, repaid ${formatNaira(ins.total_out_ngn)} so far.`;
    case "remittance":
      return ins.total_in_ngn >= ins.total_out_ngn
        ? `${formatNaira(ins.total_in_ngn)} received from ${name} over ${ins.count} ${cadence}remittances${pctClause(ins.pct_of_net_income)}.`
        : `${formatNaira(ins.total_out_ngn)} sent to ${name} over ${ins.count} ${cadence}remittances${pctClause(ins.pct_of_net_income)}.`;
    default:
      return `${formatNaira(Math.abs(ins.net_position_ngn))} with ${name}.`;
  }
}

/** A one-line summary for the compact dashboard preview. */
export function composeInsightTeaser(ins: CommunalInsight): string {
  const name = prettyName(ins.counterparty);
  switch (ins.relationship_type) {
    case "dependent":
      return `${formatNaira(ins.total_out_ngn, { notation: "compact", maximumFractionDigits: 1 })} supports ${name}${ins.pct_of_net_income > 0 ? ` — ${ins.pct_of_net_income.toFixed(1)}% of net income` : ""}`;
    case "ajo_esusu":
      return `${formatNaira(ins.total_out_ngn, { notation: "compact", maximumFractionDigits: 1 })} in ${name}'s ajo — balanced rotating savings`;
    case "informal_lending":
      return ins.net_position_ngn >= 0
        ? `${name} still owes you ${formatNaira(ins.net_position_ngn, { notation: "compact", maximumFractionDigits: 1 })}`
        : `You owe ${name} ${formatNaira(Math.abs(ins.net_position_ngn), { notation: "compact", maximumFractionDigits: 1 })}`;
    case "remittance":
      return ins.total_in_ngn >= ins.total_out_ngn
        ? `${formatNaira(ins.total_in_ngn, { notation: "compact", maximumFractionDigits: 1 })} received from ${name}`
        : `${formatNaira(ins.total_out_ngn, { notation: "compact", maximumFractionDigits: 1 })} sent to ${name}`;
    default:
      return name;
  }
}

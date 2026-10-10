/**
 * Stub communal-finance payload for Ajora.
 *
 * Mirrors the shape the FastAPI insight engine is planned to return from
 * `GET /communal`, so the UI can be built and demoed before the backend exists.
 * When the real service lands, delete the `fetchCommunalStub` body and point the
 * query at the typed OpenAPI client — the exported types and the React Query hook
 * keep every call site unchanged (same pattern as `stub/dashboard.ts`).
 *
 * ── The product story (pitch deck, "The story, our edge") ───────────────────
 * Communal patterns only emerge AFTER phantom self-transfers are removed. What's
 * left is Nigeria's invisible economy: rotating savings (ajo/esusu), "black tax"
 * support to dependents, informal lending, and remittances. This payload is what
 * the communal classifier + the NetworkX relationship graph surface.
 *
 * ── Conventions ─────────────────────────────────────────────────────────────
 * - All monetary fields are **whole Naira integers** (NOT kobo), `currency` "NGN".
 * - `*Monthly` fields are the recurring per-month figure the classifier detected.
 * - Percentages are 0..1 fractions (e.g. 0.18 = 18%), pre-rounded for display.
 * - The `graph` block is the exact shape NetworkX would emit: a `nodes`/`edges`
 *   adjacency list. Node/edge `type`/`category` are explicit string unions so the
 *   backend graph builder can match them 1:1.
 */

export type Currency = "NGN";

/** Ajo / esusu — rotating savings ("thrift") group. */
export interface AjoInsight {
  /** Recurring monthly contribution into the group, whole Naira. */
  monthlyContribution: number;
  /** Human label for the group. */
  groupName: string;
  /** Your slot in the payout rotation (1-indexed). */
  rotationPosition: number;
  /** Total members in the rotation. */
  rotationSize: number;
  /** Short label for your next payout, e.g. "March 2026". */
  nextPayoutLabel: string;
  /** Lump sum you collect on your payout turn (≈ contribution × members). */
  nextPayoutAmount: number;
  /** Deck-phrased detail sentence for the card. */
  detail: string;
}

/** Dependents — recurring family support, the "black tax". */
export interface DependentsInsight {
  /** Total recurring monthly support across all dependents, whole Naira. */
  monthlySupport: number;
  /** Number of distinct people supported. */
  dependentCount: number;
  /** Share of deduped take-home income this represents, 0..1. */
  pctOfTakeHome: number;
  /** Deck-phrased detail sentence for the card. */
  detail: string;
}

/** Informal lending — net position with one counterparty. */
export interface LendingInsight {
  /** Who you lent to. */
  counterpartyName: string;
  /** Total principal lent out, whole Naira. */
  lent: number;
  /** How much has come back so far, whole Naira. */
  returned: number;
  /** Net still owed to you (lent − returned), whole Naira. */
  outstanding: number;
  /** Deck-phrased detail sentence for the card. */
  detail: string;
}

/** Remittances — cross-border transfers to/from family. */
export interface RemittancesInsight {
  /** Money flow relative to the user. */
  direction: "inbound" | "outbound";
  /** Recurring monthly amount, whole Naira. */
  monthlyAmount: number;
  /** Where it goes / comes from, e.g. "Family in the UK". */
  destinationLabel: string;
  /** Human cadence label, e.g. "Monthly". */
  cadence: string;
  /** Deck-phrased detail sentence for the card. */
  detail: string;
}

export interface CommunalInsights {
  ajo: AjoInsight;
  dependents: DependentsInsight;
  lending: LendingInsight;
  remittances: RemittancesInsight;
}

/** The four communal categories, used to tag graph elements + cards. */
export type CommunalCategory = "ajo" | "dependents" | "lending" | "remittance";

/** A relationship-graph node (the user + each counterparty). */
export interface GraphNode {
  id: string;
  /** Display name shown on the node (the always-on identity channel). */
  label: string;
  /** Role — drives node SHAPE in the graph; backend sets this explicitly. */
  type: "self" | "thrift" | "dependent" | "lending" | "remittance";
  /** Net money direction relative to the user — drives node COLOR.
   * "self" = the user (hero); "out" = you fund them; "in" = money/asset to you. */
  direction: "self" | "in" | "out";
  /** Monthly volume (whole Naira) — drives node SIZE. Omitted for the self node. */
  amount?: number;
  /** Optional short role tag beneath the name (e.g. "Thrift group"). */
  roleLabel?: string;
}

/** A directed money-flow edge. `source`→`target` follows the money. */
export interface GraphEdge {
  id: string;
  /** Node id the money leaves. */
  source: string;
  /** Node id the money arrives at. */
  target: string;
  /** Monthly / outstanding amount on this flow, whole Naira. */
  amount: number;
  /** Direction relative to the user — drives EDGE color + legend. */
  direction: "in" | "out";
  /** Which communal category this flow belongs to. */
  category: CommunalCategory;
  /** Short edge label, e.g. "₦50k/mo". */
  label?: string;
}

/** The NetworkX-shaped relationship graph. */
export interface CommunalGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CommunalResponse {
  currency: Currency;
  /** Human label for the window the figures cover. */
  periodLabel: string;
  /** Deduped monthly take-home used for the %-of-income figures, whole Naira. */
  takeHomeMonthly: number;
  insights: CommunalInsights;
  graph: CommunalGraph;
}

/* ── The stub persona ─────────────────────────────────────────────────────── */

const insights: CommunalInsights = {
  ajo: {
    monthlyContribution: 50_000,
    groupName: "Market Women's Thrift",
    rotationPosition: 3,
    rotationSize: 8,
    nextPayoutLabel: "March 2026",
    nextPayoutAmount: 400_000,
    detail:
      "₦50k every month to your thrift group — next payout around March, you're 3rd of 8 in the rotation.",
  },
  dependents: {
    monthlySupport: 80_000,
    dependentCount: 2,
    pctOfTakeHome: 0.18,
    detail:
      "₦80k a month supports 2 family members — that's 18% of your take-home income.",
  },
  lending: {
    counterpartyName: "Tunde",
    lent: 120_000,
    returned: 40_000,
    outstanding: 80_000,
    detail:
      "You lent Tunde ₦120k; ₦40k has come back. Net, he still owes you ₦80k.",
  },
  remittances: {
    direction: "outbound",
    monthlyAmount: 60_000,
    destinationLabel: "Family in the UK",
    cadence: "Monthly",
    detail:
      "₦60k sent abroad each month to family in the UK — detected and tracked automatically, never guessed.",
  },
};

/**
 * Relationship graph. Edges follow the money: for "out" flows source is the user
 * (money leaves you); for "in" flows source is the counterparty (money/asset to
 * you). Node `direction` drives color, `type` drives shape, `amount` drives size.
 */
const graph: CommunalGraph = {
  nodes: [
    { id: "self", label: "You", type: "self", direction: "self" },
    {
      id: "thrift",
      label: "Market Women's Thrift",
      type: "thrift",
      direction: "out",
      amount: 50_000,
      roleLabel: "Ajo / esusu",
    },
    {
      id: "dep-mum",
      label: "Mum · Enugu",
      type: "dependent",
      direction: "out",
      amount: 50_000,
      roleLabel: "Dependent",
    },
    {
      id: "dep-bro",
      label: "Younger brother",
      type: "dependent",
      direction: "out",
      amount: 30_000,
      roleLabel: "Dependent",
    },
    {
      id: "tunde",
      label: "Tunde",
      type: "lending",
      direction: "in",
      amount: 80_000,
      roleLabel: "Owes you",
    },
    {
      id: "uk-family",
      label: "Family · UK",
      type: "remittance",
      direction: "out",
      amount: 60_000,
      roleLabel: "Remittance",
    },
  ],
  edges: [
    {
      id: "e-thrift",
      source: "self",
      target: "thrift",
      amount: 50_000,
      direction: "out",
      category: "ajo",
      label: "₦50k/mo",
    },
    {
      id: "e-dep-mum",
      source: "self",
      target: "dep-mum",
      amount: 50_000,
      direction: "out",
      category: "dependents",
      label: "₦50k/mo",
    },
    {
      id: "e-dep-bro",
      source: "self",
      target: "dep-bro",
      amount: 30_000,
      direction: "out",
      category: "dependents",
      label: "₦30k/mo",
    },
    {
      id: "e-tunde",
      source: "tunde",
      target: "self",
      amount: 80_000,
      direction: "in",
      category: "lending",
      label: "owes ₦80k",
    },
    {
      id: "e-uk",
      source: "self",
      target: "uk-family",
      amount: 60_000,
      direction: "out",
      category: "remittance",
      label: "₦60k/mo",
    },
  ],
};

export const communalStub: CommunalResponse = {
  currency: "NGN",
  periodLabel: "Last 6 months",
  takeHomeMonthly: 445_000,
  insights,
  graph,
};

/**
 * Resolve the stub payload, simulating a little network latency so loading
 * states are exercised during development. Signature matches a future
 * `fetchCommunal()` against the real API.
 */
export function fetchCommunalStub(): Promise<CommunalResponse> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(communalStub), 350);
  });
}

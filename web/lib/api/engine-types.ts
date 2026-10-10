/**
 * Ergonomic aliases over the OpenAPI-generated engine schema.
 *
 * `engine-schema.d.ts` is generated verbatim from the live FastAPI service's
 * `/openapi.json` by `openapi-typescript` (see web/README.md → "Regenerating the
 * API types"). Importing the deep `components["schemas"][...]` paths everywhere is
 * noisy, so this module re-exports the handful the UI actually consumes under
 * friendly names. Regenerate the `.d.ts`; these names stay stable.
 */

import type { components } from "./engine-schema";

type Schemas = components["schemas"];

// --- dedup / cashflow ---------------------------------------------------------
export type CashflowResponse = Schemas["CashflowResponse"];
export type BeforeAfter = Schemas["BeforeAfter"];
export type Totals = Schemas["Totals"];
export type MatchedTransfer = Schemas["MatchedTransfer"];

// --- transactions -------------------------------------------------------------
export type TransactionsResponse = Schemas["TransactionsResponse"];
export type EngineTransaction = Schemas["Transaction"];

// --- communal insights --------------------------------------------------------
export type InsightsResponse = Schemas["InsightsResponse"];
export type CommunalInsights = Schemas["CommunalInsights"];
export type CommunalInsight = Schemas["CommunalInsight"];

// --- relationship graph -------------------------------------------------------
export type GraphResponse = Schemas["GraphResponse"];
export type GraphNode = Schemas["GraphNode"];
export type GraphEdge = Schemas["GraphEdge"];

/** The four first-class communal relationship types (frozen engine contract). */
export type RelationshipType = GraphEdge["relationship_type"];

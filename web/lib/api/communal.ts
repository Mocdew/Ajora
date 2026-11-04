"use client";

import { useQuery } from "@tanstack/react-query";
import { engineGet, engineKeys, type EngineError } from "@/lib/api/engine";
import type {
  InsightsResponse,
  GraphResponse,
  TransactionsResponse,
} from "@/lib/api/engine-types";

/**
 * Communal-finance queries — the real insight list and the relationship graph,
 * both per-persona and keyed by `userId`.
 *
 * NOTE the double nesting on insights: the endpoint returns
 * `{ user_id, full_name, insights: { insights: CommunalInsight[], net_income_ngn } }`.
 * `useCommunalInsights` returns the outer `InsightsResponse`; read the array as
 * `data.insights.insights`.
 *
 * A persona with no communal relationships (e.g. Adaeze) returns an empty
 * `insights.insights` array and a graph with only the `__user__` node — the
 * components render explicit empty states for that.
 */

export function useCommunalInsights(userId: string) {
  return useQuery<InsightsResponse, EngineError>({
    queryKey: engineKeys.insights(userId),
    enabled: Boolean(userId),
    queryFn: ({ signal }) =>
      engineGet<InsightsResponse>(
        `/users/${encodeURIComponent(userId)}/insights`,
        signal,
      ),
  });
}

export function useRelationshipGraph(userId: string) {
  return useQuery<GraphResponse, EngineError>({
    queryKey: engineKeys.graph(userId),
    enabled: Boolean(userId),
    queryFn: ({ signal }) =>
      engineGet<GraphResponse>(
        `/users/${encodeURIComponent(userId)}/graph`,
        signal,
      ),
  });
}

/** The raw (consent-scoped) ledger — the graph inspector resolves an insight's
 *  `member_transaction_ids` against it. */
export function useTransactions(userId: string) {
  return useQuery<TransactionsResponse, EngineError>({
    queryKey: engineKeys.transactions(userId),
    enabled: Boolean(userId),
    queryFn: ({ signal }) =>
      engineGet<TransactionsResponse>(
        `/users/${encodeURIComponent(userId)}/transactions`,
        signal,
      ),
  });
}

export type { InsightsResponse, GraphResponse, TransactionsResponse };

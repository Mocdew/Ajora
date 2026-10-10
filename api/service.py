"""Pipeline orchestration for the API.

Pure functions that take a :class:`~api.providers.DataProvider` and a ``user_id``,
run the engine stages in the required order (dedup first, then communal insights on
the deduped ledger, then the relationship graph), and shape the result into the
typed response models. No I/O beyond the provider; nothing is persisted.
"""

from __future__ import annotations

from typing import List, Tuple

from engine.communal.insights import build_insights
from engine.dedup import DedupEngine
from engine.schemas.communal import CommunalInsight, CommunalInsights
from engine.schemas.dedup import DedupResult
from engine.schemas.transaction import TransactionBatch, UserProfile

from .providers import DataProvider
from .schemas import (
    BeforeAfter,
    CashflowResponse,
    GraphEdge,
    GraphNode,
    GraphResponse,
    InsightsResponse,
    TransactionsResponse,
)

# Sentinel id for the account holder's node in the relationship graph.
USER_NODE_ID = "__user__"

# One engine instance is safe to share: it is stateless and holds only config.
_ENGINE = DedupEngine()


def _run_dedup(batch: TransactionBatch) -> DedupResult:
    return _ENGINE.dedup(batch.transactions, batch.user)


def get_transactions(provider: DataProvider, user_id: str) -> TransactionsResponse:
    batch = provider.get_batch(user_id)
    return TransactionsResponse(
        user_id=batch.user.user_id,
        full_name=batch.user.full_name,
        count=len(batch.transactions),
        transactions=batch.transactions,
    )


def get_cashflow(provider: DataProvider, user_id: str) -> CashflowResponse:
    batch = provider.get_batch(user_id)
    result = _run_dedup(batch)
    t = result.totals
    before_after = BeforeAfter(
        income_before_ngn=t.gross_income,
        income_after_ngn=t.net_income,
        spending_before_ngn=t.gross_spending,
        spending_after_ngn=t.net_spending,
        income_inflation_pct=t.income_inflation_pct,
        spending_inflation_pct=t.spending_inflation_pct,
        transfer_volume_ngn=t.transfer_volume,
        matched_transfer_count=len(result.matches),
    )
    return CashflowResponse(
        user_id=batch.user.user_id,
        full_name=batch.user.full_name,
        before_after=before_after,
        totals=t,
        matches=result.matches,
        deduped_transaction_count=len(result.deduped_transactions),
        internal_transfer_ids=result.internal_transfer_ids,
    )


def get_insights(provider: DataProvider, user_id: str) -> InsightsResponse:
    batch = provider.get_batch(user_id)
    result = _run_dedup(batch)
    insights = build_insights(result, batch.user)
    return InsightsResponse(
        user_id=batch.user.user_id,
        full_name=batch.user.full_name,
        insights=insights,
    )


def get_graph(provider: DataProvider, user_id: str) -> GraphResponse:
    batch = provider.get_batch(user_id)
    result = _run_dedup(batch)
    insights = build_insights(result, batch.user)
    nodes, edges = _graph_elements(batch.user, insights)
    return GraphResponse(
        user_id=batch.user.user_id,
        full_name=batch.user.full_name,
        nodes=nodes,
        edges=edges,
    )


def _graph_elements(
    user: UserProfile, insights: CommunalInsights
) -> Tuple[List[GraphNode], List[GraphEdge]]:
    """Build Cytoscape nodes/edges from the communal insights.

    One central user node, one node per communal counterparty (typed so the frontend
    can colour by relationship), and one edge per relationship. Edge direction follows
    the net flow: user -> counterparty when the user is a net sender (e.g. ajo,
    dependent support), counterparty -> user when a net receiver (e.g. remittance_in).
    """
    nodes: List[GraphNode] = [
        GraphNode(id=USER_NODE_ID, label=user.full_name, kind="user")
    ]
    edges: List[GraphEdge] = []

    for ins in insights.insights:
        nodes.append(
            GraphNode(
                id=ins.counterparty,
                label=ins.counterparty,
                kind="counterparty",
                relationship_type=ins.relationship_type,
                tier=ins.tier,
                net_position_ngn=ins.net_position_ngn,
                total_out_ngn=ins.total_out_ngn,
                total_in_ngn=ins.total_in_ngn,
                count=ins.count,
                cadence=ins.cadence,
                pct_of_net_income=ins.pct_of_net_income,
            )
        )
        net_outflow = ins.net_position_ngn >= 0
        source, target = (
            (USER_NODE_ID, ins.counterparty) if net_outflow else (ins.counterparty, USER_NODE_ID)
        )
        edges.append(
            GraphEdge(
                id=f"{source}->{target}",
                source=source,
                target=target,
                relationship_type=ins.relationship_type,
                label=ins.relationship_type,
                net_ngn=round(abs(ins.net_position_ngn), 2),
                total_ngn=round(ins.total_out_ngn + ins.total_in_ngn, 2),
                count=ins.count,
            )
        )

    return nodes, edges

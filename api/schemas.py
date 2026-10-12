"""Typed response models for the Ajora API.

Reuses the engine's own result schemas (``Transaction``, ``MatchedTransfer``,
``Totals``, ``CommunalInsights``) wherever they already express the right shape,
and adds a few API-level wrappers: a before/after cashflow view and the Cytoscape
graph envelope the frontend consumes directly.

All money figures are NGN-normalized floats (the engine converts any foreign leg
via its configured FX rates before summing).
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from engine.schemas.communal import CommunalInsights, RelationshipType
from engine.schemas.dedup import MatchedTransfer, Totals
from engine.schemas.transaction import Transaction

from .audit import AuditEntry
from .consent import ConsentRecord

__all__ = [
    "TransactionsResponse",
    "BeforeAfter",
    "CashflowResponse",
    "InsightsResponse",
    "GraphNode",
    "GraphEdge",
    "GraphResponse",
    "UserSummary",
    "ExplanationItem",
    "ExplanationsResponse",
    "ConsentsResponse",
    "AuditResponse",
    "CorrectionRequest",
]


class TransactionsResponse(BaseModel):
    """Raw normalized transactions for a user — the pre-dedup ledger."""

    user_id: str
    full_name: str
    count: int = Field(..., description="Number of transactions returned.")
    transactions: List[Transaction]


class BeforeAfter(BaseModel):
    """The headline dedup story: naive totals vs honest (deduped) totals.

    This is the signature "phantom self-transfers inflated your numbers by 30-40%"
    moment, pulled out of ``Totals`` so the frontend can render it directly.
    """

    income_before_ngn: float = Field(..., description="Gross income (naive sum of credits).")
    income_after_ngn: float = Field(..., description="Net income after removing transfer credits.")
    spending_before_ngn: float = Field(..., description="Gross spending (naive sum of debits).")
    spending_after_ngn: float = Field(..., description="Net spending after removing transfer debits.")
    income_inflation_pct: float = Field(..., description="How much phantom transfers inflated income.")
    spending_inflation_pct: float = Field(..., description="Same, for spending.")
    transfer_volume_ngn: float = Field(..., description="Value removed as internal self-transfers.")
    matched_transfer_count: int = Field(..., description="Number of self-transfer pairs removed.")


class CashflowResponse(BaseModel):
    """Deduped cashflow: the before/after summary plus the full engine totals,
    the matched self-transfers, and the size of the clean ledger."""

    user_id: str
    full_name: str
    before_after: BeforeAfter
    totals: Totals
    matches: List[MatchedTransfer] = Field(
        default_factory=list, description="The phantom self-transfer pairs that were netted out."
    )
    deduped_transaction_count: int = Field(
        ..., description="Transactions remaining after both legs of every match are removed."
    )
    internal_transfer_ids: List[str] = Field(
        default_factory=list, description="Ids flagged as internal-transfer legs."
    )
    unmatched_candidate_count: int = Field(
        ...,
        description=(
            "Transfer-like transaction legs that found no sufficiently confident partner."
        ),
    )


class InsightsResponse(BaseModel):
    """Communal-finance insights (ajo/esusu, dependents, lending, remittance),
    computed on the deduped ledger."""

    user_id: str
    full_name: str
    insights: CommunalInsights


# --- relationship graph (Cytoscape element shape) ----------------------------------
# Cytoscape consumes elements as ``{ "data": { ... } }``; we return nodes and edges
# split into two typed lists the frontend can spread into its elements array.


class GraphNode(BaseModel):
    id: str = Field(..., description="Stable node id (the user sentinel or a counterparty key).")
    label: str
    kind: str = Field(..., description="'user' or 'counterparty'.")
    relationship_type: Optional[RelationshipType] = Field(
        default=None, description="Communal type for counterparty nodes; None for the user node."
    )
    tier: Optional[str] = None
    net_position_ngn: float = 0.0
    total_out_ngn: float = 0.0
    total_in_ngn: float = 0.0
    count: int = 0
    cadence: Optional[str] = None
    pct_of_net_income: float = 0.0


class GraphEdge(BaseModel):
    id: str
    source: str = Field(..., description="Edge tail node id (money flows source -> target).")
    target: str
    relationship_type: RelationshipType
    label: str
    net_ngn: float = Field(..., description="Net value moved in the edge's direction (absolute).")
    total_ngn: float = Field(..., description="Gross value moved between the two nodes.")
    count: int


class GraphResponse(BaseModel):
    """The user's communal relationship graph, ready for Cytoscape."""

    user_id: str
    full_name: str
    nodes: List[GraphNode]
    edges: List[GraphEdge]


# --- user roster + grounded explanations -------------------------------------------
# These two intentionally use camelCase field names to match the exact JSON the
# Next.js frontend already consumes (its `ExplanationsResponse` type), so the live
# endpoint is a drop-in for the stub.


class UserSummary(BaseModel):
    """One demo user in the roster served at ``GET /users``."""

    id: str
    name: str
    accounts: int
    transactions: int


class ExplanationItem(BaseModel):
    """One grounded explanation for a single insight (``dedup`` today)."""

    insightKey: str
    narration: str
    grounded: bool = Field(..., description="True when every cited number traces to engine output.")
    facts: Any = Field(default=None, description="The engine figures the narration is grounded on.")


class ExplanationsResponse(BaseModel):
    """Grounded LLM narration of a user's real engine output.

    Field names/shape mirror the frontend's ``ExplanationsResponse`` exactly so the
    live endpoint is interchangeable with the local stub.
    """

    userId: str
    userName: str
    generatedBy: str = Field(..., description="Model id that produced the narration, or 'stub-offline'.")
    explanations: Dict[str, ExplanationItem]


# --- trust layer: consent + audit --------------------------------------------------
# ConsentRecord (api.consent) and AuditEntry (api.audit) are the record shapes; these
# two envelopes wrap them for the GET /consents and GET /audit list endpoints.


class ConsentsResponse(BaseModel):
    """A user's per-account consent records."""

    user_id: str
    consents: List[ConsentRecord]


class AuditResponse(BaseModel):
    """A user's append-only data-access log entries, oldest-first."""

    user_id: str
    entries: List[AuditEntry]


class CorrectionRequest(BaseModel):
    """A user's verdict over one currently returned transfer match."""

    match_id: str = Field(..., min_length=1)
    verdict: Literal["confirm", "reject"]

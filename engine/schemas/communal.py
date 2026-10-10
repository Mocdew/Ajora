"""Result models for the communal-finance classification stage (stage 2).

Where dedup nets out money a user moved between *their own* accounts, this stage
surfaces the money that moves through a user's *relationships*: ajo/esusu contributions
and payouts, "black tax" / dependent support, informal lending, and diaspora
remittances. These flows are invisible to merchant-category aggregators yet dominate
real Nigerian household finance.

Classification is deterministic (lexicon + a NetworkX relationship graph), never an LLM:
per the architecture, the GenAI layer explains these numbers, it never computes them.
"""

from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from .transaction import Transaction

CommunalTag = Literal[
    "ajo",
    "ajo_payout",
    "dependent",
    "informal_loan_out",
    "loan_repayment",
    "remittance_in",
]

CommunalTier = Literal["high", "medium"]
"""high = classify automatically; medium = surface for user confirmation. Below the
accept threshold a transaction is simply left untagged (not communal)."""


class ClassifiedTransaction(BaseModel):
    transaction: Transaction
    tag: CommunalTag
    confidence: float = Field(..., ge=0, le=1)
    tier: CommunalTier
    counterparty: str = Field(..., description="Resolved relationship counterparty.")
    reasons: List[str] = Field(default_factory=list)


class CounterpartyRelationship(BaseModel):
    """One edge of the user's communal relationship graph, aggregated."""

    name: str
    role: str = Field(..., description="dependent | ajo_group | lender/borrower | remitter | other")
    out_total_ngn: float = 0.0
    in_total_ngn: float = 0.0
    out_count: int = 0
    in_count: int = 0
    months_active: int = 0
    reciprocal: bool = False
    tags: List[CommunalTag] = Field(default_factory=list)


class CommunalSummaryRow(BaseModel):
    count: int
    total_ngn: float


class CommunalResult(BaseModel):
    classifications: List[ClassifiedTransaction]
    relationships: List[CounterpartyRelationship]
    summary: Dict[str, CommunalSummaryRow] = Field(
        default_factory=dict, description="Per-tag count and NGN-normalized volume."
    )

    def tag_by_id(self) -> Dict[str, CommunalTag]:
        """Map of transaction id -> predicted tag (untagged ids are simply absent)."""
        return {c.transaction.id: c.tag for c in self.classifications}

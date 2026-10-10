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

from datetime import date
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

RelationshipType = Literal[
    "ajo_esusu",        # fixed periodic rotating-savings contribution (+ its payout)
    "dependent",        # recurring "black tax" / dependent support
    "informal_lending", # money lent, tracked by net balance (lent - repaid)
    "remittance",       # recurring cross-currency flow (inward or outward)
]
"""The four relationship-level insight types. Each maps from one or more of the six
per-transaction `CommunalTag`s (see `engine/communal/insights.py::TAG_TO_TYPE`)."""

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


# --- relationship-level INSIGHT layer (stage-2 structured output) -------------------
# One insight per external relationship, rolled up from the per-transaction
# classifications and the dedup totals. This is the stable contract the API + GenAI
# explainer consume: field names are frozen; the explainer narrates these, never the
# raw classifications.

Cadence = Literal["one-off", "weekly", "biweekly", "monthly", "quarterly", "irregular"]


class CommunalInsight(BaseModel):
    """A single communal relationship, summarized for the API / GenAI explainer.

    Every figure is NGN-normalized (foreign-currency legs converted via the engine's
    FX rates) so the explainer never has to convert. Built strictly from the dedup
    stage's output — self-transfer legs are already excluded.
    """

    # --- who / what -----------------------------------------------------------------
    counterparty: str = Field(..., description="Resolved person/entity on the other side.")
    relationship_type: RelationshipType
    confidence: float = Field(..., ge=0, le=1, description="Strongest member confidence.")
    tier: CommunalTier = Field(..., description="high = auto-surface; medium = confirm.")

    # --- how much (net-aware) -------------------------------------------------------
    total_out_ngn: float = Field(0.0, description="Money the user sent this counterparty.")
    total_in_ngn: float = Field(0.0, description="Money received from this counterparty.")
    net_position_ngn: float = Field(
        0.0,
        description=(
            "total_out_ngn - total_in_ngn. For informal_lending this is the outstanding "
            "balance: positive = the counterparty still owes the user."
        ),
    )

    # --- how often ------------------------------------------------------------------
    count: int = Field(..., ge=1, description="Number of member transactions.")
    cadence: Cadence = Field(..., description="Inferred rhythm from the timestamps.")
    first_seen: date
    last_seen: date
    months_active: int = Field(..., ge=0, description="Distinct calendar months with activity.")

    # --- share of the user's finances -----------------------------------------------
    pct_of_net_income: float = Field(
        ...,
        description=(
            "The relationship's relevant volume as a %% of the user's net (deduped) "
            "income. Numerator by type: ajo_esusu/dependent = outflow; remittance = the "
            "dominant direction's volume (inflow for remittance_in); informal_lending = "
            "net_position_ngn (outstanding exposure). 0.0 when net income is non-positive."
        ),
    )

    # --- provenance / explainer fuel ------------------------------------------------
    member_transaction_ids: List[str] = Field(default_factory=list)
    tags: List[CommunalTag] = Field(
        default_factory=list, description="Distinct per-transaction tags rolled into this insight."
    )
    reasons: List[str] = Field(
        default_factory=list, description="Short human-readable signals for the explainer."
    )


class CommunalInsights(BaseModel):
    """The relationship-insight view: the four first-class types, one object per
    relationship, plus the dedup net income they are measured against."""

    insights: List[CommunalInsight] = Field(default_factory=list)
    net_income_ngn: float = Field(
        ..., description="DedupResult.totals.net_income — the denominator for pct_of_net_income."
    )

    def types_detected(self) -> List[RelationshipType]:
        """Distinct relationship types present (order-stable, de-duplicated)."""
        seen: List[RelationshipType] = []
        for ins in self.insights:
            if ins.relationship_type not in seen:
                seen.append(ins.relationship_type)
        return seen

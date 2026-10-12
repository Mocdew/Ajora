"""Result models for the transfer-dedup stage.

Single source of truth; `backend/app/schemas/dedup.py` re-exports these exact
classes. Only pydantic is imported — no web/DB/network.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .transaction import Transaction

Tier = Literal["high", "medium", "low"]
"""Confidence that a matched pair really is one self-transfer.

- high   : treat as an internal transfer automatically.
- medium : very likely; surface for one-tap confirmation.
- low    : plausible; needs the user to confirm/reject (feeds corrections.jsonl).
"""


class MatchedTransfer(BaseModel):
    """A debit leg matched to its mirror credit leg — a phantom self-transfer that
    naive aggregation would have double-counted as both spending and income."""

    match_id: str = Field(
        ...,
        description="Stable id derived from the matched debit and credit transaction ids.",
    )
    debit: Transaction
    credit: Transaction
    score: float = Field(..., ge=0, le=1, description="Match confidence in [0, 1].")
    tier: Tier
    fee: float = Field(
        ...,
        description=(
            "Value lost between the legs, in NGN. For a same-currency pair this is "
            "debit.amount - credit.amount (the NIP fee). For a cross-currency pair it "
            "is the NGN-equivalent spread (debit_ngn - credit_ngn)."
        ),
    )
    cross_currency: bool = Field(
        default=False,
        description="True when the two legs are in different currencies (FX self-transfer).",
    )
    reasons: list[str] = Field(
        default_factory=list, description="Human-readable signals that drove the match."
    )


class Totals(BaseModel):
    """Before/after view — the headline number that justifies the whole stage.

    All figures are NGN-normalized: any non-NGN leg is converted via the engine's
    configured FX rates before summing, so income/spending stay in one unit even
    when a domiciliary (USD) account is in the mix.
    """

    gross_income: float = Field(..., description="Sum of all credits (NGN-normalized), pre-dedup.")
    gross_spending: float = Field(..., description="Sum of all debits (NGN-normalized), pre-dedup.")
    transfer_volume: float = Field(..., description="Value removed as internal transfers (NGN).")
    net_income: float = Field(..., description="Income after removing transfer credits.")
    net_spending: float = Field(..., description="Spending after removing transfer debits.")
    income_inflation_pct: float = Field(
        ..., description="How much phantom transfers inflated gross income, as a %."
    )
    spending_inflation_pct: float = Field(..., description="Same, for gross spending.")


class DedupResult(BaseModel):
    matches: list[MatchedTransfer]
    totals: Totals
    unmatched_transfer_candidates: list[Transaction] = Field(
        default_factory=list,
        description="Legs that looked transfer-like but found no confident partner.",
    )
    # --- the explicit deduped output (stage 4 (a)) --------------------------------
    deduped_transactions: list[Transaction] = Field(
        default_factory=list,
        description=(
            "The original transactions with both legs of every matched self-transfer "
            "removed — the clean ledger a downstream income/spending view should use."
        ),
    )
    internal_transfer_ids: list[str] = Field(
        default_factory=list,
        description=(
            "Transaction ids flagged as internal-transfer legs (the union of every "
            "matched pair's two legs). Lets a consumer *flag* rather than drop them."
        ),
    )

"""Normalized transaction schema — the single shape every bank feed is mapped to
before it reaches the dedup/classification engines.

Raw open-banking payloads (Mono first, plus the schema-matched mock layer) are
heterogeneous. We normalize each institution's feed into `Transaction` so the ML
pipeline never has to know which bank a record came from. Everything downstream
(dedup, communal classification, the eval harness) consumes these models only.

This module is the **single source of truth** for the dedup-stage transaction
schema. `backend/app/schemas/transaction.py` is a thin re-export shim over it, so
every historical import path (`app.schemas.transaction`) keeps resolving to these
exact classes — no parallel copy.

Purity: only pydantic is imported here. No FastAPI, no DB, no network. The engine
and its tests import this freely and cheaply. No persistence: these live in memory
for the duration of a request.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

Direction = Literal["debit", "credit"]
"""debit = money leaving an account (outflow); credit = money arriving (inflow)."""


class Transaction(BaseModel):
    """A single normalized bank transaction.

    `amount` is always a positive magnitude; the money's direction lives in
    `direction`. This keeps the sign convention explicit and bank-agnostic.
    """

    model_config = ConfigDict(frozen=True)

    id: str = Field(..., description="Stable unique id (bank-provided or synthesized).")
    account_id: str = Field(..., description="Which of the user's accounts this belongs to.")
    institution: str = Field(..., description="Bank slug, e.g. 'gtbank', 'access', 'kuda'.")

    amount: float = Field(..., gt=0, description="Positive magnitude in `currency`.")
    currency: str = Field(default="NGN")
    direction: Direction

    timestamp: datetime
    narration: str = Field(default="", description="Raw bank narration / description.")

    counterparty_name: Optional[str] = Field(
        default=None, description="Counterparty name if the bank supplies it separately."
    )
    reference: Optional[str] = Field(
        default=None, description="Bank reference / NIP session id if supplied separately."
    )
    balance: Optional[float] = Field(default=None, description="Running balance after the txn.")
    raw_category: Optional[str] = Field(default=None, description="Category as the bank labelled it.")

    # Eval-only ground truth. Two legs of the same real-world self-transfer share a
    # `transfer_pair_id`. None => not a self-transfer leg. The engine MUST NOT read this;
    # it exists solely so the eval harness can score precision/recall.
    transfer_pair_id: Optional[str] = Field(default=None, exclude=True)

    # Eval-only ground truth for the communal-finance classification stage. Controlled
    # vocabulary (None => not a communal transaction):
    #   - "ajo"              : a monthly rotating-savings (ajo/esusu) contribution out.
    #   - "ajo_payout"       : the lump-sum payout received when it is the user's turn.
    #   - "dependent"        : recurring "black tax" / dependent support transfer out.
    #   - "informal_loan_out": money lent to a friend/relative.
    #   - "loan_repayment"   : a (possibly partial) repayment received for that loan.
    #   - "remittance_in"    : a cross-currency remittance received from abroad.
    # Like `transfer_pair_id`, the engine MUST NOT read this; it is ground truth only.
    communal_tag: Optional[str] = Field(default=None, exclude=True)

    @field_validator("institution")
    @classmethod
    def _slugify_institution(cls, v: str) -> str:
        return v.strip().lower().replace(" ", "")

    @field_validator("currency")
    @classmethod
    def _uppercase_currency(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("timestamp")
    @classmethod
    def _normalize_timestamp(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v.astimezone(timezone.utc)


class UserProfile(BaseModel):
    """The account holder. Used by dedup to recognize the user's own name on both
    legs of a self-transfer, and to know which accounts belong to one person."""

    user_id: str
    full_name: str
    aliases: list[str] = Field(
        default_factory=list,
        description="Alternate spellings / name orderings the banks might show.",
    )
    account_ids: list[str] = Field(default_factory=list)


class TransactionBatch(BaseModel):
    """One user's transactions across all their institutions — the unit the dedup
    engine operates on (self-transfers only make sense within a single person)."""

    user: UserProfile
    transactions: list[Transaction]

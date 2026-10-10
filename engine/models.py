"""Canonical data models — the single source of truth for Ajora's engine.

Every bank feed (Mono, Okra, the file-based mock layer, and any future provider)
is normalized into the models defined here *before* it reaches any downstream
stage. The dedup pipeline (Hungarian assignment + RapidFuzz similarity) and the
communal-finance classifier consume **only** these models; neither ever sees a
provider's raw payload shape. When a new provider is onboarded, you write an
adapter into this schema — you never teach the engine a new wire format.

Design decisions baked into this module (and why):

* **Money is ``Decimal``, never ``float``.** Financial magnitudes must not drift
  through binary floating point. Adapters build every amount from ``str`` so no
  float noise ever enters the model.
* **``amount`` is a positive magnitude; flow lives in ``direction``.** Banks
  disagree on sign conventions (some send signed amounts, some send a ``type``
  field, some split debit/credit columns). We collapse all of that into a
  positive ``amount`` plus an explicit :class:`TransactionDirection`. Dedup pairs
  a **debit at institution A** against a **credit at institution B**, so a
  sign-free, unambiguous direction is essential.
* **``institution`` is mandatory and slugified.** Dedup is *cross-institution* by
  definition — the phantom self-transfer only exists because the two legs live at
  two different banks — so the source institution must always be known and
  directly comparable.
* **``narration`` and the counterparty fields are preserved verbatim.** RapidFuzz
  similarity over narration / counterparty name is the primary signal for matching
  the two legs of a self-transfer, and later for classifying ajo/esusu, dependent
  support, and informal lending. Lossy cleanup here would blind the pipeline.
* **``raw`` preserves the original provider payload / anything we don't model
  explicitly.** Provenance is never discarded; an adapter stashes provider-specific
  leftovers here so the GenAI explainer and audit log can still reference them.
* **``transfer_pair_id`` and ``communal_tag`` are eval-only ground truth.** They
  exist only in the labelled mock dataset so the eval harness can score
  precision/recall. They are ``exclude``-d from serialization and the engine MUST
  NOT read them — a real provider never supplies them.

This module has **zero web (FastAPI) and zero DB imports** and performs no work at
import time, so the engine — and tests — can import it freely and cheaply.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

__all__ = [
    "TransactionDirection",
    "CommunalTag",
    "Account",
    "Transaction",
]

# Controlled vocabulary for the communal-finance classification ground truth
# (per the shared-context schema). ``None`` means "not a communal transaction".
CommunalTag = Literal["ajo", "dependent", "lending", "remittance"]

# NGN is quoted to the kobo (2 minor units). All money is quantized to this scale
# so that amounts normalized from different providers compare exactly.
_MONEY_SCALE = Decimal("0.01")


def _quantize_money(value: Decimal) -> Decimal:
    """Round a monetary ``Decimal`` to 2 dp (kobo) with bankers-free half-up rounding."""
    return value.quantize(_MONEY_SCALE, rounding=ROUND_HALF_UP)


class TransactionDirection(str, Enum):
    """Direction of money flow, relative to the account the transaction belongs to.

    ``DEBIT`` = money leaving the account (outflow).
    ``CREDIT`` = money arriving in the account (inflow).

    A cross-institution self-transfer is, by construction, a ``DEBIT`` leg at one
    institution matched to a ``CREDIT`` leg at another.
    """

    DEBIT = "debit"
    CREDIT = "credit"


class Account(BaseModel):
    """A single bank account belonging to the user.

    Supplied alongside transactions so the pipeline knows which real-world accounts
    exist and which institution each belongs to. Self-transfers only make sense
    *within one person's* set of accounts, so this is how the dedup stage scopes a
    candidate match.
    """

    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)

    account_id: str = Field(..., description="Stable, provider-unique account identifier.")
    institution: str = Field(..., description="Bank slug, e.g. 'gtbank', 'kuda', 'access-bank'.")
    account_name: Optional[str] = Field(
        default=None, description="Account holder name as this bank spells it."
    )
    account_number: Optional[str] = Field(
        default=None, description="NUBAN / masked account number if the provider supplies it."
    )
    currency: str = Field(default="NGN", description="ISO 4217 currency code.")

    @field_validator("institution")
    @classmethod
    def _slugify_institution(cls, v: str) -> str:
        return v.strip().lower().replace(" ", "-")

    @field_validator("currency")
    @classmethod
    def _upper_currency(cls, v: str) -> str:
        return v.strip().upper()


class Transaction(BaseModel):
    """A single normalized bank transaction — the atom of the whole engine.

    Immutable by design: once a raw payload is normalized, nothing downstream may
    mutate it. The dedup and classification stages derive *new* data (confidence
    tiers, group ids, tags) rather than editing these records in place.
    """

    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)

    # --- identity -----------------------------------------------------------
    id: str = Field(
        ..., description="Stable, provider-unique transaction id. Unique within one provider feed."
    )
    account_id: str = Field(..., description="Which of the user's accounts this belongs to.")
    institution: str = Field(
        ..., description="Bank slug the transaction was pulled from. Required: dedup is cross-institution."
    )

    # --- money --------------------------------------------------------------
    amount: Decimal = Field(
        ...,
        gt=0,
        description="Positive magnitude in `currency`. Direction is carried separately.",
    )
    direction: TransactionDirection = Field(
        ..., description="debit (outflow) or credit (inflow)."
    )
    currency: str = Field(default="NGN", description="ISO 4217 currency code.")
    balance_after: Optional[Decimal] = Field(
        default=None, description="Running account balance immediately after this transaction."
    )

    # --- when ---------------------------------------------------------------
    timestamp: datetime = Field(
        ...,
        description="Timezone-aware instant of the transaction, normalized to UTC.",
    )

    # --- text signals (dedup + classification depend on these) --------------
    narration: str = Field(
        default="",
        description="Raw bank narration / description. Fuzzy-matched by RapidFuzz; never cleaned lossily.",
    )
    counterparty_name: Optional[str] = Field(
        default=None, description="Counterparty name if the bank supplies it separately from narration."
    )
    counterparty_account: Optional[str] = Field(
        default=None, description="Counterparty account / NUBAN if supplied."
    )
    counterparty_bank: Optional[str] = Field(
        default=None, description="Counterparty institution if supplied (helps confirm the far leg)."
    )
    reference: Optional[str] = Field(
        default=None, description="Bank reference / NIP session id. A shared ref is a strong self-transfer signal."
    )
    category: Optional[str] = Field(
        default=None, description="Category hint as the bank labelled it (advisory only; never trusted blindly)."
    )

    # --- provenance ---------------------------------------------------------
    raw: dict[str, Any] = Field(
        default_factory=dict,
        description="Original provider payload / unmodelled extras, preserved for provenance, audit, and the explainer.",
    )

    # --- eval-only ground truth (the engine MUST NOT read these) ------------
    transfer_pair_id: Optional[str] = Field(
        default=None,
        exclude=True,
        description=(
            "Ground truth: the two legs of one real self-transfer share this id "
            "(None => not a self-transfer leg). Present only in the labelled mock "
            "dataset; excluded from serialization. The dedup engine must NOT read "
            "it — it exists so the eval harness can score precision/recall."
        ),
    )
    communal_tag: Optional[CommunalTag] = Field(
        default=None,
        exclude=True,
        description=(
            "Ground truth for communal-finance classification (ajo/dependent/"
            "lending/remittance; None => not communal). Eval-only and excluded "
            "from serialization; the classifier must NOT read it."
        ),
    )

    @field_validator("institution", "counterparty_bank")
    @classmethod
    def _slugify_institution(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return v.strip().lower().replace(" ", "-")

    @field_validator("currency")
    @classmethod
    def _upper_currency(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("amount")
    @classmethod
    def _quantize_amount(cls, v: Decimal) -> Decimal:
        return _quantize_money(v)

    @field_validator("balance_after")
    @classmethod
    def _quantize_balance(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        return None if v is None else _quantize_money(v)

    @field_validator("timestamp")
    @classmethod
    def _ensure_utc(cls, v: datetime) -> datetime:
        """Normalize the parsed instant to UTC.

        Providers emit wildly different time formats (ISO-8601 with offset, epoch
        milliseconds, local naive strings). Adapters parse those into ``datetime``
        objects; this guard makes the stored instant canonical so that the same
        real-world moment from two banks compares equal — which the dedup time
        window relies on. A naive datetime is assumed to be UTC rather than rejected,
        so a sloppy adapter degrades predictably instead of crashing the pull.
        """
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v.astimezone(timezone.utc)

"""Schema adapters — the normalization layer.

Each adapter takes a single **raw provider payload dict** and returns one canonical
:class:`engine.models.Transaction`. This is the *only* place that knows a specific
bank/aggregator wire format; everything downstream speaks canonical models.

Two deliberately divergent shapes are implemented to prove the layer genuinely
reconciles real-world differences rather than renaming near-identical fields:

================  ===============================  ================================
field             Mono-style (``mono_to_transaction``)   Okra-style (``okra_to_transaction``)
================  ===============================  ================================
transaction id    ``_id``                          ``id``
amount units      **kobo** (integer minor units)   **naira** (major units, float)
direction         explicit ``type`` field          **sign** of ``amount`` (−=debit)
timestamp         ISO-8601 string (``date``)       **epoch milliseconds** (``trans_date``)
narration         ``narration``                    ``notes``
reference         ``reference``                    ``ref``
counterparty      ``counterparty``                 ``contact``
category          ``category``                     ``cat``
institution       ``institution``                  ``bank``
================  ===============================  ================================

Both collapse to the same canonical form: a positive ``Decimal`` amount, an explicit
:class:`TransactionDirection`, and a UTC-aware timestamp. Any field we don't model is
preserved under ``raw`` so provenance is never lost.

The labelled **mock** dataset may also carry eval-only ground truth
(``transfer_pair_id``, ``communal_tag``) alongside the bank fields; adapters pass it
through when present. A real Mono/Okra payload never contains it, so the live path
leaves both ``None``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from engine.models import Transaction, TransactionDirection

__all__ = ["mono_to_transaction", "okra_to_transaction", "ADAPTERS"]

# Fields each adapter consumes explicitly; everything else is swept into ``raw``
# so the original record remains auditable. The eval-only ground-truth keys are
# listed here too so they are threaded through the model instead of leaking into
# the provenance blob.
_MONO_KNOWN = {"_id", "account", "institution", "type", "amount", "narration",
               "date", "balance", "category", "reference", "counterparty",
               "counterparty_account", "counterparty_bank", "currency",
               "transfer_pair_id", "communal_tag"}
_OKRA_KNOWN = {"id", "account_id", "bank", "amount", "notes", "trans_date",
               "balance", "cat", "ref", "contact", "contact_account", "currency",
               "transfer_pair_id", "communal_tag"}


def _to_decimal(value: Any) -> Decimal:
    """Build a ``Decimal`` without going through ``float`` (no binary drift)."""
    return Decimal(str(value))


def _extra(payload: dict[str, Any], known: set[str]) -> dict[str, Any]:
    return {k: v for k, v in payload.items() if k not in known}


# --------------------------------------------------------------------------- Mono
def mono_to_transaction(payload: dict[str, Any]) -> Transaction:
    """Normalize one Mono-style record.

    Mono reports ``amount``/``balance`` in **kobo** (integer minor units) and carries
    an explicit ``type`` of ``"debit"``/``"credit"``. Timestamps are ISO-8601 strings.
    """
    amount_kobo = payload["amount"]
    balance_kobo = payload.get("balance")

    return Transaction(
        id=str(payload["_id"]),
        account_id=str(payload["account"]),
        institution=str(payload["institution"]),
        amount=_to_decimal(amount_kobo) / Decimal(100),
        direction=TransactionDirection(str(payload["type"]).lower()),
        currency=str(payload.get("currency", "NGN")),
        balance_after=(_to_decimal(balance_kobo) / Decimal(100)) if balance_kobo is not None else None,
        timestamp=_parse_iso(payload["date"]),
        narration=payload.get("narration", "") or "",
        counterparty_name=payload.get("counterparty"),
        counterparty_account=payload.get("counterparty_account"),
        counterparty_bank=payload.get("counterparty_bank"),
        reference=payload.get("reference"),
        category=payload.get("category"),
        transfer_pair_id=payload.get("transfer_pair_id"),
        communal_tag=payload.get("communal_tag"),
        raw={"provider": "mono", **_extra(payload, _MONO_KNOWN)},
    )


# --------------------------------------------------------------------------- Okra
def okra_to_transaction(payload: dict[str, Any]) -> Transaction:
    """Normalize one Okra-style record.

    Okra reports ``amount``/``balance`` in **naira** (major units) and encodes
    direction in the **sign** of ``amount`` (negative = debit, positive = credit).
    Timestamps arrive as **epoch milliseconds** in ``trans_date``.
    """
    signed_amount = _to_decimal(payload["amount"])
    direction = TransactionDirection.CREDIT if signed_amount >= 0 else TransactionDirection.DEBIT
    balance = payload.get("balance")

    return Transaction(
        id=str(payload["id"]),
        account_id=str(payload["account_id"]),
        institution=str(payload["bank"]),
        amount=abs(signed_amount),
        direction=direction,
        currency=str(payload.get("currency", "NGN")),
        balance_after=_to_decimal(balance) if balance is not None else None,
        timestamp=_parse_epoch_ms(payload["trans_date"]),
        narration=payload.get("notes", "") or "",
        counterparty_name=payload.get("contact"),
        counterparty_account=payload.get("contact_account"),
        counterparty_bank=None,
        reference=payload.get("ref"),
        category=payload.get("cat"),
        transfer_pair_id=payload.get("transfer_pair_id"),
        communal_tag=payload.get("communal_tag"),
        raw={"provider": "okra", **_extra(payload, _OKRA_KNOWN)},
    )


# --------------------------------------------------------------------- time parsing
def _parse_iso(value: str) -> datetime:
    """Parse an ISO-8601 string (handling a trailing ``Z``) into an aware datetime."""
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _parse_epoch_ms(value: Any) -> datetime:
    """Parse epoch **milliseconds** into a UTC-aware datetime."""
    return datetime.fromtimestamp(int(value) / 1000, tz=timezone.utc)


# Registry so the provider can resolve an adapter by the payload's ``provider`` tag.
ADAPTERS = {
    "mono": mono_to_transaction,
    "okra": okra_to_transaction,
}

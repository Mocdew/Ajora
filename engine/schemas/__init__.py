"""Canonical dedup-stage schemas (the single source of truth).

These are the Pydantic models the transfer-dedup pipeline and its eval harness
consume. ``engine.Transaction`` also re-exports the same float-backed
``Transaction`` from the package root.
"""

from engine.schemas.dedup import DedupResult, MatchedTransfer, Tier, Totals
from engine.schemas.transaction import (
    Direction,
    Transaction,
    TransactionBatch,
    UserProfile,
)

__all__ = [
    "Direction",
    "Transaction",
    "UserProfile",
    "TransactionBatch",
    "Tier",
    "MatchedTransfer",
    "Totals",
    "DedupResult",
]

"""Canonical dedup-stage schemas (the single source of truth).

These are the Pydantic models the transfer-dedup pipeline and its eval harness
consume. The historical `app.schemas.*` import paths are thin re-export shims over
this package, so there is exactly one definition of each class.

Note: this is a *different* layer from the provider-spine models in
``engine.models`` (``engine.models.Transaction`` is the Decimal-based canonical
feed model used by ``data/`` adapters + the spine tests). The dedup stage was
built against the float-based ``Transaction`` here and against the labelled
``backend/data`` fixtures; the two are kept as separate layers deliberately rather
than force-merged (see the module docstring in ``engine.schemas.transaction``).
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

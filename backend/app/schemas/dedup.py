"""Re-export shim — dedup result models now live in ``engine.schemas.dedup``."""

from __future__ import annotations

import app as _app  # noqa: F401  (ensures the repo root is on sys.path for `engine`)

from engine.schemas.dedup import (  # noqa: F401
    DedupResult,
    MatchedTransfer,
    Tier,
    Totals,
)

__all__ = ["Tier", "MatchedTransfer", "Totals", "DedupResult"]

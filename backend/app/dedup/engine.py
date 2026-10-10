"""Re-export shim — the dedup engine now lives in ``engine.dedup.engine``."""

from __future__ import annotations

import app as _app  # noqa: F401  (ensures the repo root is on sys.path for `engine`)

from engine.dedup.engine import DedupEngine  # noqa: F401

__all__ = ["DedupEngine"]

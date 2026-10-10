"""Re-export shim — the dedup eval harness now lives in ``engine.dedup.evaluation``."""

from __future__ import annotations

import app as _app  # noqa: F401  (ensures the repo root is on sys.path for `engine`)

from engine.dedup.evaluation import DedupMetrics, evaluate  # noqa: F401

__all__ = ["DedupMetrics", "evaluate"]

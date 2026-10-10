"""Re-export shim — narration parsing now lives in ``engine.dedup.normalize``."""

from __future__ import annotations

import app as _app  # noqa: F401  (ensures the repo root is on sys.path for `engine`)

from engine.dedup.normalize import clean_name, extract_references  # noqa: F401

__all__ = ["clean_name", "extract_references"]

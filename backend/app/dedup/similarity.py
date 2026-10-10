"""Re-export shim — pairwise scoring now lives in ``engine.dedup.similarity``.

Private helpers (``_name_similarity``) are re-exported too, since a couple of call
sites historically reached for them.
"""

from __future__ import annotations

import app as _app  # noqa: F401  (ensures the repo root is on sys.path for `engine`)

from engine.dedup.similarity import (  # noqa: F401
    BatchContext,
    DedupConfig,
    PairFeatures,
    _name_similarity,
    build_reasons,
    extract_features,
    is_feasible,
    rule_score,
)

__all__ = [
    "DedupConfig",
    "BatchContext",
    "PairFeatures",
    "extract_features",
    "is_feasible",
    "rule_score",
    "build_reasons",
]

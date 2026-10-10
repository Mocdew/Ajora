"""Re-export shim — confidence scoring now lives in ``engine.dedup.scorer``."""

from __future__ import annotations

import app as _app  # noqa: F401  (ensures the repo root is on sys.path for `engine`)

from engine.dedup.scorer import (  # noqa: F401
    FEATURE_ORDER,
    LogisticScorer,
    RuleBasedScorer,
    Scorer,
    features_to_vector,
    tier_for,
)

__all__ = [
    "FEATURE_ORDER",
    "features_to_vector",
    "Scorer",
    "RuleBasedScorer",
    "LogisticScorer",
    "tier_for",
]

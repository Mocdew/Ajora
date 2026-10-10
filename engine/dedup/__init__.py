"""Cross-institution transfer-dedup pipeline — the single source of truth.

The four stages live here: candidate match + scoring (`similarity`, `scorer`),
optimal Hungarian pairing + tiers + deduped output (`engine`), narration parsing
(`normalize`), and the precision/recall/F1 eval harness (`evaluation`).

`backend/app/dedup/*` modules are thin re-export shims over this package, so the
historical `app.dedup.*` import paths resolve to these exact objects.
"""

from engine.dedup.engine import DedupEngine
from engine.dedup.evaluation import DedupMetrics, evaluate
from engine.dedup.normalize import clean_name, extract_references
from engine.dedup.scorer import (
    FEATURE_ORDER,
    LogisticScorer,
    RuleBasedScorer,
    Scorer,
    features_to_vector,
    tier_for,
)
from engine.dedup.similarity import (
    BatchContext,
    DedupConfig,
    PairFeatures,
    build_reasons,
    extract_features,
    is_feasible,
    rule_score,
)

__all__ = [
    "DedupEngine",
    "DedupConfig",
    "BatchContext",
    "PairFeatures",
    "extract_features",
    "is_feasible",
    "rule_score",
    "build_reasons",
    "RuleBasedScorer",
    "LogisticScorer",
    "Scorer",
    "tier_for",
    "features_to_vector",
    "FEATURE_ORDER",
    "evaluate",
    "DedupMetrics",
    "clean_name",
    "extract_references",
]

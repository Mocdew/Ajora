"""Confidence scoring for candidate pairs.

Two interchangeable scorers share the same feature definition (`PairFeatures`):

- `RuleBasedScorer` — the weighted heuristic in `similarity.py`. Works with zero
  training data, so the demo runs out of the box.
- `LogisticScorer` — a scikit-learn `LogisticRegression` + `StandardScaler` pipeline
  that learns the mapping from features to P(same transfer) once we have labelled pairs
  (bootstrapped from the persona dataset, then refined offline from corrections.jsonl).
  Until it is `fit`, it transparently falls back to the rule-based score.

Keeping both behind one `score(...)` interface lets the engine stay agnostic and lets
the eval harness compare heuristic vs learned without touching pipeline code.

Single source of truth; `app.dedup.scorer` re-exports these. Pure: numpy + (lazy)
scikit-learn only.
"""

from __future__ import annotations

from typing import Protocol

import numpy as np

from ..schemas.transaction import Transaction
from .similarity import DedupConfig, PairFeatures, rule_score

# Fixed feature order for the learned model — must stay stable across train/serve.
FEATURE_ORDER: tuple[str, ...] = (
    "amount_rel_diff",
    "fee_abs",
    "time_gap_hours",
    "name_sim",
    "user_name_sim",
    "ref_match",
    "cross_institution",
    "cross_currency",
    "route_recurrence",
    "round_amount",
)


def features_to_vector(f: PairFeatures) -> list[float]:
    d = f.as_dict()
    return [float(d[name]) for name in FEATURE_ORDER]


class Scorer(Protocol):
    def score(self, f: PairFeatures, debit: Transaction, cfg: DedupConfig) -> float: ...


class RuleBasedScorer:
    def score(self, f: PairFeatures, debit: Transaction, cfg: DedupConfig) -> float:
        return rule_score(f, debit, cfg)


class LogisticScorer:
    """scikit-learn confidence scorer. Falls back to the rule-based score until fitted."""

    def __init__(self) -> None:
        self._pipeline = None  # built lazily in fit() to keep sklearn import cost off hot paths
        self._fallback = RuleBasedScorer()

    @property
    def is_fitted(self) -> bool:
        return self._pipeline is not None

    def fit(self, features: list[PairFeatures], labels: list[int]) -> "LogisticScorer":
        """Train on labelled candidate pairs. `labels[i]` is 1 if the pair is a real
        self-transfer, else 0."""
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        X = np.asarray([features_to_vector(f) for f in features], dtype=float)
        y = np.asarray(labels, dtype=int)
        if len(np.unique(y)) < 2:
            raise ValueError("Need both positive and negative labelled pairs to fit.")

        self._pipeline = Pipeline(
            [
                ("scale", StandardScaler()),
                ("clf", LogisticRegression(max_iter=1000, class_weight="balanced")),
            ]
        )
        self._pipeline.fit(X, y)
        return self

    def score(self, f: PairFeatures, debit: Transaction, cfg: DedupConfig) -> float:
        if self._pipeline is None:
            return self._fallback.score(f, debit, cfg)
        x = np.asarray([features_to_vector(f)], dtype=float)
        return float(self._pipeline.predict_proba(x)[0, 1])


def tier_for(score: float, cfg: DedupConfig) -> str:
    if score >= cfg.tier_high:
        return "high"
    if score >= cfg.tier_medium:
        return "medium"
    return "low"

"""Ajora engine — stateless, in-memory financial-insight pipeline.

Exposes the canonical data models that every stage (dedup, communal-finance
classification, the GenAI explainer) consumes. No web or DB dependencies.
"""

from engine.grouping import (
    cross_account_candidates,
    group_by_account,
    group_by_institution,
    in_window,
    window_around,
)
from engine.models import Account, Transaction, TransactionDirection

__all__ = [
    "Account",
    "Transaction",
    "TransactionDirection",
    "group_by_account",
    "group_by_institution",
    "in_window",
    "window_around",
    "cross_account_candidates",
]

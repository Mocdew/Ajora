"""Ajora engine — stateless, in-memory financial-insight pipeline.

The package root exposes the canonical float-backed transaction model consumed by
dedup, communal-finance classification, and the GenAI explainer. The engine is
pure: no web or database dependencies.
"""

from engine.schemas.transaction import Direction, Transaction, TransactionBatch, UserProfile

__all__ = [
    "Direction",
    "Transaction",
    "TransactionBatch",
    "UserProfile",
]

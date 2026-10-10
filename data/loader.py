"""Loader — the one-call bridge from a provider to the engine.

The engine is a **pure** library: it receives plain ``list[Transaction]`` and knows
nothing about where the data came from. This module is the seam that keeps it that
way. It lives *outside* ``engine/`` on purpose — it is allowed to touch the data
layer (providers, files), the engine is not.

Typical use (tests, demo, the eventual API):

    from data.loader import load_persona

    txns = load_persona("persona_1")          # list[Transaction], one call
    result = run_dedup(txns)                   # engine stage receives plain models

Swapping the mock for a live aggregator is a one-argument change — pass any
:class:`~data.provider.DataProvider`:

    load_persona("real-user-123", provider=MonoProvider(client))
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from engine.models import Transaction

from .provider import DataProvider, MockProvider

__all__ = ["load_persona", "available_personas"]

# data/mock/*.json — the labelled persona dataset the demo/tests run on.
_MOCK_DIR = Path(__file__).resolve().parent / "mock"


def load_persona(
    user_id: str,
    provider: Optional[DataProvider] = None,
) -> List[Transaction]:
    """Load one persona's transactions as plain canonical :class:`Transaction` objects.

    This is the single entry point the engine's test harness (and the demo) uses:
    give it a persona id, get back a normalized transaction list ready to feed to any
    engine stage. No engine import of the data layer is required — the dependency
    points one way only (data -> engine).

    ``provider`` defaults to :class:`~data.provider.MockProvider` (the file-backed
    labelled dataset). Pass a live provider to load real data through the same path.
    """
    provider = provider if provider is not None else MockProvider()
    return provider.get_transactions(user_id)


def available_personas() -> List[str]:
    """Return the ids of every persona in the mock dataset, sorted.

    Lets a harness iterate every labelled persona ("load *any* persona by id")
    without hard-coding the roster.
    """
    return sorted(p.stem for p in _MOCK_DIR.glob("*.json"))

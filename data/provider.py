"""Data providers — where canonical transactions come from.

A :class:`DataProvider` pulls a user's transactions from *somewhere* (a live
open-banking aggregator, or the file-based mock layer) and returns them as
canonical :class:`engine.models.Transaction` objects. The engine depends on this
interface, never on a concrete provider, so swapping the mock for a live Mono/Okra
integration is a one-class change with no downstream edits.

Consistent with the project's **stateless, no-database** architecture (see
``CLAUDE.md``): a provider pulls, normalizes in memory, and hands back a list.
Nothing is persisted here; raw bank data is never stored.

Implementing a real provider later::

    class MonoProvider(DataProvider):
        def __init__(self, client: MonoClient) -> None:
            self._client = client

        def get_transactions(self, user_id: str) -> list[Transaction]:
            raw = self._client.fetch_transactions(user_id)   # live API call
            return [mono_to_transaction(r) for r in raw]      # reuse the adapter

A ``MonoProvider`` / ``OkraProvider`` reuses the exact same adapters in
``data.adapters`` that :class:`MockProvider` uses — only the *source* of the raw
payloads changes.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from engine.models import Transaction

from .adapters import ADAPTERS

__all__ = ["DataProvider", "MockProvider"]

# data/mock/*.json live next to this module.
_MOCK_DIR = Path(__file__).resolve().parent / "mock"


class DataProvider(ABC):
    """Abstract source of canonical transactions for one user.

    One method, one contract: given a ``user_id``, return that user's transactions
    already normalized into the canonical schema. How they are fetched (HTTP, file,
    cache) is the implementation's business and invisible to the engine.
    """

    @abstractmethod
    def get_transactions(self, user_id: str) -> list[Transaction]:
        """Return the user's transactions as canonical :class:`Transaction` objects."""
        raise NotImplementedError


class MockProvider(DataProvider):
    """File-backed provider for the demo and tests.

    Loads a raw payload from ``data/mock/<user_id>.json``, resolves the right
    adapter from the payload's ``provider`` tag, and returns canonical
    transactions. This lets the whole pipeline run end-to-end with zero live bank
    credentials, while exercising the real normalization path (same adapters a live
    provider would use).

    Expected payload shape::

        {
          "provider": "mono" | "okra",
          "user_id": "persona_1",
          "transactions": [ { ...raw provider record... }, ... ]
        }
    """

    def __init__(self, mock_dir: Path | None = None) -> None:
        self._mock_dir = Path(mock_dir) if mock_dir is not None else _MOCK_DIR

    def get_transactions(self, user_id: str) -> list[Transaction]:
        payload = self._load(user_id)

        provider_tag = str(payload.get("provider", "")).lower()
        if provider_tag not in ADAPTERS:
            raise ValueError(
                f"Unknown or missing provider tag {provider_tag!r} in fixture for "
                f"{user_id!r}; expected one of {sorted(ADAPTERS)}."
            )
        adapt = ADAPTERS[provider_tag]

        records = payload.get("transactions", [])
        if not isinstance(records, list):
            raise ValueError(f"'transactions' must be a list in fixture for {user_id!r}.")

        return [adapt(record) for record in records]

    def _load(self, user_id: str) -> dict[str, Any]:
        path = self._mock_dir / f"{user_id}.json"
        if not path.is_file():
            available = sorted(p.stem for p in self._mock_dir.glob("*.json"))
            raise FileNotFoundError(
                f"No mock fixture for user {user_id!r} at {path}. Available: {available}."
            )
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)

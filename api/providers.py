"""Data providers for the API — the seam between HTTP and the engine.

Every route reaches its data through a :class:`DataProvider`, never by touching
files directly. Today the only implementation is :class:`FilePersonaProvider`
(the labelled demo personas on disk); a live ``MonoProvider`` / ``OkraProvider``
would implement the same two methods and slot in with no route changes.

Per the no-database architecture, nothing is persisted here. The provider holds an
in-memory index of ``user_id -> file path`` (metadata, not bank data) and re-reads
and re-validates the source on each request, so no raw transaction data lingers
between calls.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Protocol, runtime_checkable

from engine.schemas.transaction import TransactionBatch

__all__ = ["DataProvider", "FilePersonaProvider", "UserNotFound"]

# The labelled persona fixtures live under the backend data dir (shared with the
# engine harnesses). The API reads them but owns neither the files nor the engine.
_DATA_DIR = Path(__file__).resolve().parent.parent / "backend" / "data"
_MOCK_DIR = _DATA_DIR / "mock"
# A small standalone demo persona (u_demo_stephen) lives outside the mock dir.
_SAMPLE_PATH = _DATA_DIR / "sample_transactions.json"


class UserNotFound(KeyError):
    """Raised when a provider has no data for the requested ``user_id``."""


@runtime_checkable
class DataProvider(Protocol):
    """Source of one user's transactions, already validated into the engine schema.

    Two methods, one contract. How the data is fetched (file, live aggregator, cache)
    is the implementation's business and invisible to the routes.
    """

    def list_users(self) -> List[str]:
        """Return every ``user_id`` this provider can serve."""
        ...

    def get_batch(self, user_id: str) -> TransactionBatch:
        """Return the user's :class:`TransactionBatch` (profile + transactions).

        Raises :class:`UserNotFound` if the id is unknown.
        """
        ...


class FilePersonaProvider:
    """File-backed provider over the labelled ``persona_*.json`` fixtures.

    Builds a ``user_id -> path`` index once at construction (reading only the user
    id out of each file), then re-reads and re-validates the chosen file per request
    so no bank data is cached across calls.
    """

    def __init__(self, mock_dir: Path | None = None, sample_path: Path | None = None) -> None:
        self._mock_dir = Path(mock_dir) if mock_dir is not None else _MOCK_DIR
        self._sample_path = Path(sample_path) if sample_path is not None else _SAMPLE_PATH
        self._index: Dict[str, Path] = self._build_index(self._mock_dir, self._sample_path)

    @staticmethod
    def _build_index(mock_dir: Path, sample_path: Path) -> Dict[str, Path]:
        index: Dict[str, Path] = {}
        paths = list(sorted(mock_dir.glob("persona_*.json")))
        if sample_path.is_file():
            paths.append(sample_path)
        for path in paths:
            raw = json.loads(path.read_text(encoding="utf-8"))
            user_id = raw.get("user", {}).get("user_id")
            if user_id:
                index[str(user_id)] = path
        return index

    def list_users(self) -> List[str]:
        return sorted(self._index)

    def get_batch(self, user_id: str) -> TransactionBatch:
        path = self._index.get(user_id)
        if path is None:
            raise UserNotFound(user_id)
        raw = json.loads(path.read_text(encoding="utf-8"))
        return TransactionBatch.model_validate(raw)

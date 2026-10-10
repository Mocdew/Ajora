"""Shared fixtures for the engine test suite.

Tests may know filesystem paths (only the *library* must stay path-agnostic), so we
load the labelled fixtures straight from ``backend/data`` here.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

import pytest

from engine.schemas.transaction import TransactionBatch

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DATA_DIR = _REPO_ROOT / "backend" / "data"


def _load(path: Path) -> TransactionBatch:
    return TransactionBatch.model_validate(json.loads(path.read_text(encoding="utf-8")))


@pytest.fixture(scope="session")
def data_dir() -> Path:
    return _DATA_DIR


@pytest.fixture(scope="session")
def sample_batch() -> TransactionBatch:
    return _load(_DATA_DIR / "sample_transactions.json")


@pytest.fixture(scope="session")
def persona_batches() -> Dict[str, TransactionBatch]:
    out: Dict[str, TransactionBatch] = {}
    for p in sorted((_DATA_DIR / "mock").glob("persona_*.json")):
        out[p.stem] = _load(p)
    return out


@pytest.fixture(scope="session")
def all_batches(sample_batch, persona_batches) -> List[TransactionBatch]:
    return [sample_batch, *persona_batches.values()]

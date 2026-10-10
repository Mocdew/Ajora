"""Load labelled persona datasets from files (no DB — data is files, loaded in memory)."""

from __future__ import annotations

import json
from pathlib import Path

from .schemas.transaction import TransactionBatch

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SAMPLE_PATH = DATA_DIR / "sample_transactions.json"

# The generated, labelled persona fixtures live here as individual JSON files
# (`persona_*.json`). They are the demo data *and* the eval set for both ML stages.
MOCK_DIR = DATA_DIR / "mock"


def load_batch(path: str | Path = SAMPLE_PATH) -> TransactionBatch:
    """Parse a persona-dataset JSON file into a validated `TransactionBatch`."""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return TransactionBatch.model_validate(raw)


def persona_paths(mock_dir: str | Path = MOCK_DIR) -> list[Path]:
    """Sorted list of every `persona_*.json` file in the mock directory."""
    return sorted(Path(mock_dir).glob("persona_*.json"))


def load_all_personas(mock_dir: str | Path = MOCK_DIR) -> list[TransactionBatch]:
    """Load and validate every `persona_*.json` fixture into `TransactionBatch`es."""
    return [load_batch(p) for p in persona_paths(mock_dir)]

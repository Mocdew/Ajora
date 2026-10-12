"""Append-only user feedback for transfer matches.

Confirm/reject verdicts are durable training signals, not live model overrides. Each
verdict appends one immutable JSON object to ``corrections.jsonl``; the engine remains
stateless and can consume these records during an offline scorer retraining pass.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Literal, Protocol, runtime_checkable

from pydantic import BaseModel, Field

__all__ = [
    "CorrectionRecord",
    "CorrectionVerdict",
    "CorrectionsLog",
    "FileCorrectionsLog",
]

CorrectionVerdict = Literal["confirm", "reject"]


class CorrectionRecord(BaseModel):
    """One immutable verdict over a dedup match."""

    timestamp: str = Field(..., description="UTC ISO-8601 instant the verdict was recorded.")
    user_id: str
    match_id: str
    verdict: CorrectionVerdict
    debit_transaction_id: str
    credit_transaction_id: str
    previous_score: float = Field(..., ge=0, le=1)
    previous_tier: Literal["high", "medium", "low"]


@runtime_checkable
class CorrectionsLog(Protocol):
    """Append-only sink for correction records."""

    def record(
        self,
        *,
        user_id: str,
        match_id: str,
        verdict: CorrectionVerdict,
        debit_transaction_id: str,
        credit_transaction_id: str,
        previous_score: float,
        previous_tier: Literal["high", "medium", "low"],
    ) -> CorrectionRecord: ...

    def entries_for(self, user_id: str, limit: int = 200) -> List[CorrectionRecord]: ...


class FileCorrectionsLog:
    """Append-only corrections log backed by one JSONL file."""

    def __init__(self, path: Path) -> None:
        self._path = Path(path)

    def record(
        self,
        *,
        user_id: str,
        match_id: str,
        verdict: CorrectionVerdict,
        debit_transaction_id: str,
        credit_transaction_id: str,
        previous_score: float,
        previous_tier: Literal["high", "medium", "low"],
    ) -> CorrectionRecord:
        entry = CorrectionRecord(
            timestamp=datetime.now(timezone.utc).isoformat(),
            user_id=user_id,
            match_id=match_id,
            verdict=verdict,
            debit_transaction_id=debit_transaction_id,
            credit_transaction_id=credit_transaction_id,
            previous_score=previous_score,
            previous_tier=previous_tier,
        )
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry.model_dump(), ensure_ascii=False) + "\n")
        return entry

    def entries_for(self, user_id: str, limit: int = 200) -> List[CorrectionRecord]:
        if not self._path.is_file():
            return []
        out: List[CorrectionRecord] = []
        with self._path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                raw = json.loads(line)
                if raw.get("user_id") == user_id:
                    out.append(CorrectionRecord.model_validate(raw))
        return out[-limit:] if limit else out

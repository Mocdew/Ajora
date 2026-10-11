"""Append-only audit log for data access — the "auditable, never sold" claim, real.

Every time a user's bank data is read to answer an endpoint, exactly one immutable
entry is appended to an append-only JSONL file (one JSON object per line, never
rewritten). This is the durable state the no-database architecture explicitly allows
(see CLAUDE.md): a file, not a DB.

The writer is behind the :class:`AuditLog` interface so a real audit sink (object
storage, a SIEM, a managed append-only log) can replace :class:`FileAuditLog` with
no route changes — the same way the :class:`~api.providers.DataProvider` seam lets a
live aggregator replace the file-backed persona provider.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Protocol, runtime_checkable

from pydantic import BaseModel, Field

__all__ = ["AuditEntry", "AuditLog", "FileAuditLog"]


class AuditEntry(BaseModel):
    """One immutable record of a single data access.

    ``accounts_accessed`` are the *consented* account ids whose transactions were
    actually read for this call; ``revoked_excluded`` are the user's accounts that
    were withheld because consent is revoked. Together they make every access
    self-describing: what was served, and what was deliberately not.
    """

    timestamp: str = Field(..., description="UTC ISO-8601 instant the access happened.")
    user_id: str
    endpoint: str = Field(..., description="Logical endpoint, e.g. 'cashflow'.")
    accounts_accessed: List[str] = Field(
        default_factory=list, description="Consented account ids actually read."
    )
    revoked_excluded: List[str] = Field(
        default_factory=list, description="The user's accounts withheld (consent revoked)."
    )


@runtime_checkable
class AuditLog(Protocol):
    """Append-only sink for :class:`AuditEntry` records.

    One method to write, one to read back. Implementations must never mutate or
    delete an already-written entry.
    """

    def record(
        self,
        user_id: str,
        endpoint: str,
        accounts_accessed: List[str],
        revoked_excluded: List[str],
    ) -> AuditEntry:
        """Append exactly one entry for a data access and return it."""
        ...

    def entries_for(self, user_id: str, limit: int = 200) -> List[AuditEntry]:
        """Return up to ``limit`` of the user's entries, oldest-first."""
        ...


class FileAuditLog:
    """Append-only audit log backed by a single JSONL file.

    Writes open the file in append mode and add one line; reads re-scan the file.
    No entry is ever rewritten, so the file is a tamper-evident access trail.
    """

    def __init__(self, path: Path) -> None:
        self._path = Path(path)

    def record(
        self,
        user_id: str,
        endpoint: str,
        accounts_accessed: List[str],
        revoked_excluded: List[str],
    ) -> AuditEntry:
        entry = AuditEntry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            user_id=user_id,
            endpoint=endpoint,
            accounts_accessed=list(accounts_accessed),
            revoked_excluded=list(revoked_excluded),
        )
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry.model_dump(), ensure_ascii=False) + "\n")
        return entry

    def entries_for(self, user_id: str, limit: int = 200) -> List[AuditEntry]:
        if not self._path.is_file():
            return []
        out: List[AuditEntry] = []
        with self._path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                raw = json.loads(line)
                if raw.get("user_id") == user_id:
                    out.append(AuditEntry.model_validate(raw))
        return out[-limit:] if limit else out

"""FastAPI dependencies.

Public analytics uses reviewed synthetic fixtures and dedicated append-only state.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from .audit import AuditLog, FileAuditLog
from .consent import ConsentStore, FileConsentStore
from .corrections import CorrectionsLog, FileCorrectionsLog
from .providers import DataProvider, PublicDemoProvider

__all__ = [
    "get_provider",
    "get_consent_store",
    "get_audit_log",
    "get_corrections_log",
]

# Durable append-only state lives at the repo root (git-ignored), per CLAUDE.md.
_REPO_ROOT = Path(__file__).resolve().parent.parent
_STATE_ROOT = Path(os.environ.get("AJORA_STATE_DIR", str(_REPO_ROOT))) / "analytics-demo"
_CONSENT_PATH = _STATE_ROOT / "consent.jsonl"
_AUDIT_PATH = _STATE_ROOT / "audit.jsonl"
_CORRECTIONS_PATH = _STATE_ROOT / "corrections.jsonl"


@lru_cache(maxsize=1)
def get_provider() -> DataProvider:
    return PublicDemoProvider()


@lru_cache(maxsize=1)
def get_consent_store() -> ConsentStore:
    return FileConsentStore(_CONSENT_PATH)


@lru_cache(maxsize=1)
def get_audit_log() -> AuditLog:
    return FileAuditLog(_AUDIT_PATH)


@lru_cache(maxsize=1)
def get_corrections_log() -> CorrectionsLog:
    return FileCorrectionsLog(_CORRECTIONS_PATH)

"""FastAPI dependencies.

The provider, consent store, and audit log are each a process-wide singleton. The
provider is stateless aside from an in-memory ``user_id -> path`` index; the consent
store and audit log own their append-only files (``consent.jsonl`` / ``audit.jsonl``
at the repo root) and keep them open across requests. Swapping in a live provider or
a real consent/audit sink later is a one-line change here.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from .audit import AuditLog, FileAuditLog
from .consent import ConsentStore, FileConsentStore
from .providers import DataProvider, FilePersonaProvider

__all__ = ["get_provider", "get_consent_store", "get_audit_log"]

# Durable append-only state lives at the repo root (git-ignored), per CLAUDE.md.
_REPO_ROOT = Path(__file__).resolve().parent.parent
_CONSENT_PATH = _REPO_ROOT / "consent.jsonl"
_AUDIT_PATH = _REPO_ROOT / "audit.jsonl"


@lru_cache(maxsize=1)
def get_provider() -> DataProvider:
    return FilePersonaProvider()


@lru_cache(maxsize=1)
def get_consent_store() -> ConsentStore:
    return FileConsentStore(_CONSENT_PATH)


@lru_cache(maxsize=1)
def get_audit_log() -> AuditLog:
    return FileAuditLog(_AUDIT_PATH)

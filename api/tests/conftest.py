"""Shared test fixtures for append-only consent, audit, and correction state.

The autouse fixture redirects every durable file to a per-test temporary directory,
so no test ever touches the real repo-root runtime files.
"""

from __future__ import annotations

import pytest

from api.audit import FileAuditLog
from api.consent import FileConsentStore
from api.corrections import FileCorrectionsLog
from api.deps import get_audit_log, get_consent_store, get_corrections_log
from api.main import app


@pytest.fixture(autouse=True)
def tmp_trust_state(tmp_path, monkeypatch):
    """Point all trust stores at throwaway files for each test."""
    # All API tests run offline, including on machines configured for the live adapter.
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    # A temporary SQLite path must never be overridden by inherited hosted
    # storage credentials, and lifespan startup must not seed the real state.
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("AJORA_REQUIRE_REMOTE_SAVINGS", raising=False)
    monkeypatch.delenv("AJORA_DEMO_EMAIL", raising=False)
    monkeypatch.delenv("AJORA_DEMO_PASSWORD", raising=False)
    for key in ("AJORA_RESEND_API_KEY", "AJORA_EMAIL_FROM", "AJORA_PUBLIC_WEB_URL"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("AJORA_STATE_DIR", str(tmp_path))
    consent_store = FileConsentStore(tmp_path / "consent.jsonl")
    audit_log = FileAuditLog(tmp_path / "audit.jsonl")
    corrections_log = FileCorrectionsLog(tmp_path / "corrections.jsonl")
    app.dependency_overrides[get_consent_store] = lambda: consent_store
    app.dependency_overrides[get_audit_log] = lambda: audit_log
    app.dependency_overrides[get_corrections_log] = lambda: corrections_log
    yield {
        "consent_store": consent_store,
        "audit_log": audit_log,
        "corrections_log": corrections_log,
        "consent_path": tmp_path / "consent.jsonl",
        "audit_path": tmp_path / "audit.jsonl",
        "corrections_path": tmp_path / "corrections.jsonl",
    }
    app.dependency_overrides.pop(get_consent_store, None)
    app.dependency_overrides.pop(get_audit_log, None)
    app.dependency_overrides.pop(get_corrections_log, None)

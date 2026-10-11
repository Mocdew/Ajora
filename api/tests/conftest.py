"""Shared test fixtures.

The trust layer writes append-only ``consent.jsonl`` / ``audit.jsonl`` files. This
autouse fixture redirects BOTH at a per-test tmp dir via dependency overrides, so no
test ever touches the real repo-root files — this protects the pre-existing endpoint
tests too, since every data endpoint now loads through the consent/audit seam.
"""

from __future__ import annotations

import pytest

from api.audit import FileAuditLog
from api.consent import FileConsentStore
from api.deps import get_audit_log, get_consent_store
from api.main import app


@pytest.fixture(autouse=True)
def tmp_trust_state(tmp_path):
    """Point the consent store and audit log at throwaway files for each test."""
    consent_store = FileConsentStore(tmp_path / "consent.jsonl")
    audit_log = FileAuditLog(tmp_path / "audit.jsonl")
    app.dependency_overrides[get_consent_store] = lambda: consent_store
    app.dependency_overrides[get_audit_log] = lambda: audit_log
    yield {
        "consent_store": consent_store,
        "audit_log": audit_log,
        "consent_path": tmp_path / "consent.jsonl",
        "audit_path": tmp_path / "audit.jsonl",
    }
    app.dependency_overrides.pop(get_consent_store, None)
    app.dependency_overrides.pop(get_audit_log, None)

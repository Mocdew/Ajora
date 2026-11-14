import json
import logging
import sqlite3

from fastapi.testclient import TestClient

from api import savings_storage
from api.main import app
from api.savings import database, get_savings_path


def test_readiness_checks_existing_schema_without_initializing_missing_store():
    client = TestClient(app)
    assert client.get("/ready").status_code == 503
    assert not get_savings_path().exists()
    with database(get_savings_path()):
        pass
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
    assert response.headers["cache-control"] == "no-store"


def test_failed_remote_readiness_and_write_report_redacted_failure(monkeypatch, caplog):
    monkeypatch.setenv("AJORA_REQUIRE_REMOTE_SAVINGS", "true")
    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://test.turso.io")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "private-token")

    def unavailable(*_):
        raise sqlite3.OperationalError("private-token")

    monkeypatch.setattr(savings_storage, "_connect_remote", unavailable)
    client = TestClient(app)
    assert client.get("/health").json() == {"status": "ok"}
    response = client.get("/ready")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    response = client.post("/auth/login", json={"email": "member@example.com", "password": "private-password"})
    assert response.status_code == 503
    assert "private-token" not in response.text
    assert not get_savings_path().exists()
    log = json.loads(caplog.records[-1].getMessage())
    assert log["request_id"] == response.headers["x-request-id"]
    assert log["route"] == "/auth/login"
    assert log["error"] == "storage_unavailable"
    for sensitive in ("private-token", "member@example.com", "private-password"):
        assert sensitive not in caplog.text


def test_private_errors_and_logs_do_not_echo_sensitive_fields(caplog):
    client = TestClient(app)
    with caplog.at_level(logging.INFO, "uvicorn.error"):
        response = client.get("/savings/invitations/PRIVATE-INVITE")
        assert response.status_code == 401
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-content-type-options"] == "nosniff"
        assert "/savings/invitations/{invite_code}" in caplog.text
        assert "PRIVATE-INVITE" not in caplog.text
        assert client.post("/savings/session", json={"display_name": "Member One"}).is_success
        response = client.post("/savings/circles/unknown/contributions", json={
            "round_number": 1, "reference": "PRIVATE-REFERENCE", "amount_kobo": 0,
        })
        assert response.status_code == 422
        assert "PRIVATE-REFERENCE" not in response.text + caplog.text
        assert response.headers["cache-control"] == "no-store"


def test_malformed_host_cannot_bypass_credential_redaction():
    response = TestClient(app).post("/auth/register", headers={"Host": "example.test?private"}, json={
        "email": "not-an-email", "password": "private-password", "display_name": "Tester",
    })
    assert response.status_code == 422
    assert "private-password" not in response.text
    assert "not-an-email" not in response.text
    assert response.headers["cache-control"] == "no-store"

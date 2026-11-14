import json
import logging
import secrets
import sqlite3

from fastapi.testclient import TestClient
import pytest

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


@pytest.mark.parametrize("token", [None, "", "short-token"])
def test_required_staging_access_fails_closed_if_token_unusable(monkeypatch, token):
    monkeypatch.setenv("AJORA_STAGING_ACCESS_REQUIRED", "true")
    if token is not None:
        monkeypatch.setenv("AJORA_STAGING_ACCESS_TOKEN", token)
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}
        assert client.head("/health").status_code == 200
        assert client.post("/health").status_code == 403
        assert client.get("/health/").status_code == 403
        assert client.get("/ready", headers={"X-Ajora-Staging-Access": token or ""}).status_code == 403
        assert not get_savings_path().exists()


def test_staging_access_guards_all_other_routes_before_identity_or_storage(monkeypatch, caplog):
    token = secrets.token_urlsafe(32)
    monkeypatch.setenv("AJORA_STAGING_ACCESS_TOKEN", token)
    monkeypatch.setenv("AJORA_STAGING_ACCESS_REQUIRED", "true")
    allowed = {"X-Ajora-Staging-Access": token}
    wrong_token = "wrong-staging-token"
    with TestClient(app) as client, caplog.at_level(logging.INFO, "uvicorn.error"):
        for path in ("/", "/ready", "/openapi.json", "/docs", "/users", "/savings/session", "/savings/circles"):
            response = client.get(path, headers={"X-Ajora-Staging-Access": wrong_token})
            assert response.status_code == 403 and response.headers["cache-control"] == "no-store"
            assert response.headers["x-request-id"]
            assert token not in response.text and wrong_token not in response.text

        assert client.post("/savings/session", json={"display_name": "Synthetic member"}).status_code == 403
        assert not get_savings_path().exists()
        assert client.get("/savings/session", headers=allowed).status_code == 401
        created = client.post("/savings/session", headers=allowed, json={"display_name": "Synthetic member"})
        assert created.status_code == 201 and created.headers["cache-control"] == "no-store"
        assert client.get("/savings/session", headers=allowed).json()["user_id"] == created.json()["user_id"]
        assert client.get("/savings/session").status_code == 403
        assert client.get("/ready", headers=allowed).status_code == 200
        assert token not in caplog.text and wrong_token not in caplog.text

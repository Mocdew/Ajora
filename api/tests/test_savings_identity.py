"""Recovery retains durable membership without retaining secret keys."""
import hashlib
from datetime import datetime, timedelta, timezone
import sqlite3
import time

from fastapi.testclient import TestClient
import pytest

from api.main import app
from api.savings import COOKIE, get_savings_path


@pytest.fixture
def identity(tmp_path):
    path = tmp_path / "savings.sqlite3"
    app.dependency_overrides[get_savings_path] = lambda: path
    with TestClient(app) as owner, TestClient(app) as fresh:
        original = owner.post("/savings/session", json={"display_name": "Ada"}).json()
        yield owner, fresh, original, path
    app.dependency_overrides.pop(get_savings_path, None)


def test_recovery_retains_membership_after_expiry_and_revokes_old_sessions(identity):
    owner, fresh, original, path = identity
    circle = owner.post("/savings/circles", json={
        "name": "Family circle", "contribution_kobo": 1_000_000,
        "frequency": "monthly", "member_limit": 2,
        "start_date": (datetime.now(timezone(timedelta(hours=1))).date() + timedelta(days=1)).isoformat(),
    }).json()
    response = owner.post("/savings/recovery-key", json={})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    key = response.json()["recovery_key"]
    old_cookie = owner.cookies.get(COOKIE)
    with sqlite3.connect(path) as conn:
        conn.execute("UPDATE savings_sessions SET expires_at=?", (int(time.time()) - 1,))
    assert owner.get("/savings/session").status_code == 401
    recovered = fresh.post("/savings/recover", json={"recovery_key": key})
    assert recovered.status_code == 200
    assert recovered.json() == original
    assert "HttpOnly" in recovered.headers["set-cookie"]
    assert recovered.headers["cache-control"] == "no-store"
    assert fresh.get(f"/savings/circles/{circle['id']}").status_code == 200
    assert fresh.cookies.get(COOKIE) != old_cookie
    assert owner.get("/savings/session").status_code == 401
    assert "recovery_key" not in fresh.get("/savings/session").json()
    with sqlite3.connect(path) as conn:
        stored = conn.execute("SELECT key_hash FROM savings_recovery_keys").fetchone()[0]
        assert stored == hashlib.sha256(key.encode()).hexdigest()
        assert conn.execute("SELECT count(*) FROM savings_sessions").fetchone()[0] == 1
    assert key.encode() not in path.read_bytes()


def test_key_replacement_invalidates_previous_key_and_logout_revokes_cookie(identity):
    owner, fresh, original, _ = identity
    first = owner.post("/savings/recovery-key", json={}).json()["recovery_key"]
    second = owner.post("/savings/recovery-key", json={}).json()["recovery_key"]
    assert first != second
    assert fresh.post("/savings/recover", json={"recovery_key": first}).status_code == 401
    assert fresh.post("/savings/recover", json={"recovery_key": "ajora_" + "x" * 43}).status_code == 401
    assert fresh.get("/savings/session").status_code == 401
    assert fresh.post("/savings/recover", json={"recovery_key": second}).json() == original
    assert owner.get("/savings/session").status_code == 401
    cookie = fresh.cookies.get(COOKIE)
    assert fresh.post("/savings/logout", json={}).status_code == 204
    fresh.cookies.set(COOKIE, cookie)
    assert fresh.get("/savings/session").status_code == 401


def test_recovery_key_generation_requires_session_and_does_not_create_identities(identity):
    owner, fresh, _, path = identity
    assert fresh.post("/savings/recovery-key", json={}).status_code == 401
    assert fresh.post("/savings/recover", json={"recovery_key": "short"}).status_code == 422
    assert fresh.post("/savings/recover", json={"recovery_key": "ajora_" + "x" * 43}).status_code == 401
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_users").fetchone()[0] == 1

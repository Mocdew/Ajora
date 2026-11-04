"""Demo credentials survive service startup without changing existing users."""
import sqlite3

from fastapi.testclient import TestClient
import pytest

from api.demo_account import seed_demo_account
from api.main import app
from api.savings import database


PASSWORD = "test demo passphrase only"


@pytest.fixture
def demo(tmp_path, monkeypatch):
    monkeypatch.setenv("AJORA_STATE_DIR", str(tmp_path))
    monkeypatch.setenv("AJORA_DEMO_EMAIL", "demo@example.com")
    monkeypatch.setenv("AJORA_DEMO_PASSWORD", PASSWORD)
    return tmp_path / "savings.sqlite3"


def login():
    with TestClient(app) as client:
        response = client.post("/auth/login", json={"email": "demo@example.com", "password": PASSWORD})
        assert response.status_code == 200
        assert client.get("/savings/circles").json() == []
        return response.json()["user_id"]


def test_startup_keeps_identity_hash_and_records_on_restart(demo):
    original = login()
    with sqlite3.connect(demo) as conn:
        stored = conn.execute("SELECT password_hash FROM savings_credentials").fetchone()[0]
        conn.execute("UPDATE savings_users SET display_name='Retained name' WHERE id=?", (original,))
    assert login() == original
    with sqlite3.connect(demo) as conn:
        assert conn.execute("SELECT password_hash FROM savings_credentials").fetchone()[0] == stored
        assert conn.execute("SELECT display_name FROM savings_users").fetchone()[0] == "Retained name"
        assert conn.execute("SELECT count(*) FROM savings_users").fetchone()[0] == 1
    assert stored.startswith("pbkdf2_sha256$")
    assert PASSWORD.encode() not in demo.read_bytes()


def test_startup_recreates_login_after_temporary_state_is_lost(demo):
    original = login()
    demo.unlink()
    assert login() != original


def test_existing_credentials_are_never_overwritten(demo, monkeypatch):
    original = login()
    monkeypatch.setenv("AJORA_DEMO_PASSWORD", "another valid demo password")
    with pytest.raises(RuntimeError, match="conflict"):
        seed_demo_account(demo)
    monkeypatch.setenv("AJORA_DEMO_PASSWORD", PASSWORD)
    assert login() == original


def test_unconfigured_startup_does_not_create_state(demo, monkeypatch):
    monkeypatch.delenv("AJORA_DEMO_EMAIL")
    monkeypatch.delenv("AJORA_DEMO_PASSWORD")
    seed_demo_account(demo)
    assert not demo.exists()


def test_demo_bootstrap_cannot_claim_an_existing_google_email(demo):
    with database(demo, write=True) as conn:
        conn.execute("INSERT INTO savings_users VALUES ('google-user', 'Google member')")
        conn.execute("INSERT INTO savings_google_accounts VALUES ('google-sub', 'google-user', 'demo@example.com')")
    with pytest.raises(RuntimeError, match="conflict"):
        seed_demo_account(demo)
    with sqlite3.connect(demo) as conn:
        assert conn.execute("SELECT count(*) FROM savings_users").fetchone()[0] == 1
        assert conn.execute("SELECT count(*) FROM savings_credentials").fetchone()[0] == 0


@pytest.mark.parametrize("email,password", [(None, PASSWORD), ("demo@example.com", None), ("invalid", PASSWORD), ("demo@example.com", "short")])
def test_invalid_configuration_fails_without_disclosing_secrets(demo, monkeypatch, email, password):
    for name, value in [("AJORA_DEMO_EMAIL", email), ("AJORA_DEMO_PASSWORD", password)]:
        if value is None:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, value)
    with pytest.raises(RuntimeError) as error:
        seed_demo_account(demo)
    assert PASSWORD not in str(error.value)
    assert not demo.exists()

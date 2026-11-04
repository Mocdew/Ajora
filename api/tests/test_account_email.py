"""Mailbox proofs recover the same account without exposing reusable secrets."""
from contextlib import contextmanager
from datetime import date, timedelta
import hashlib
import sqlite3
import time
from types import SimpleNamespace

from fastapi.testclient import TestClient
import pytest

from api import account_email, account_mail, auth as auth_api
from api.main import app
from api.savings import COOKIE, get_savings_path


PASSWORD = "my original private passphrase"
NEW_PASSWORD = "my replacement private passphrase"
ACCOUNT = {"display_name": "Ada", "email": "ada@example.com", "password": PASSWORD}


@pytest.fixture
def email_accounts(tmp_path, monkeypatch):
    path = tmp_path / "savings.sqlite3"
    sent, notices = [], []
    monkeypatch.setattr(account_mail, "delivery_available", lambda: True)
    monkeypatch.setattr(account_mail, "send_account_email", lambda email, purpose, token: sent.append((email, purpose, token)))
    monkeypatch.setattr(account_mail, "send_password_changed_email", notices.append)
    app.dependency_overrides[get_savings_path] = lambda: path
    with TestClient(app) as owner, TestClient(app) as visitor:
        yield SimpleNamespace(owner=owner, visitor=visitor, path=path, sent=sent, notices=notices)
    app.dependency_overrides.pop(get_savings_path, None)


def register(state):
    response = state.owner.post("/auth/register", json=ACCOUNT)
    assert response.status_code == 201
    return response.json()


def request_token(state, purpose):
    if purpose == "reset":
        response = state.visitor.post("/auth/password/forgot", json={"email": ACCOUNT["email"]})
    else:
        response = state.owner.post("/auth/email/request", json={})
    assert response.status_code == 202
    assert response.headers["Cache-Control"] == "no-store"
    email, actual_purpose, token = state.sent[-1]
    assert (email, actual_purpose) == (ACCOUNT["email"], purpose)
    assert token not in response.text
    return token


def consume(state, purpose, token):
    route = "/auth/password/reset" if purpose == "reset" else "/auth/email/verify"
    body = {"token": token, **({"password": NEW_PASSWORD} if purpose == "reset" else {})}
    return state.visitor.post(route, json=body)


def test_reset_restores_same_identity_and_circle_and_revokes_all_old_access(email_accounts):
    state = email_accounts
    original = register(state)
    assert state.visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": PASSWORD}).status_code == 200
    circle = state.owner.post("/savings/circles", json={
        "name": "Family savings", "contribution_kobo": 10_000, "frequency": "monthly",
        "member_limit": 2, "start_date": (date.today() + timedelta(days=2)).isoformat(),
    }).json()
    with sqlite3.connect(state.path) as conn:
        conn.execute("INSERT INTO savings_recovery_keys VALUES (?, ?)", (original["user_id"], "stale-legacy-hash"))
    token = request_token(state, "reset")
    response = consume(state, "reset", token)
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    assert "Max-Age=0" in response.headers["set-cookie"]
    assert state.owner.get("/savings/session").status_code == 401
    assert state.visitor.get("/savings/session").status_code == 401
    assert state.notices == [ACCOUNT["email"]]
    assert state.visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": PASSWORD}).status_code == 401
    fresh = state.visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": NEW_PASSWORD})
    assert fresh.status_code == 200
    assert fresh.json() == original
    assert state.visitor.get(f"/savings/circles/{circle['id']}").json() == circle
    assert state.visitor.get("/auth/email/status").json() == {
        "email": ACCOUNT["email"], "verified": True, "delivery_available": True,
    }
    with sqlite3.connect(state.path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_recovery_keys").fetchone()[0] == 0
        assert conn.execute("SELECT count(*) FROM savings_email_tokens").fetchone()[0] == 0
        assert conn.execute("SELECT count(*) FROM savings_users").fetchone()[0] == 1
    assert NEW_PASSWORD.encode() not in state.path.read_bytes()


def test_verification_is_explicit_single_use_and_does_not_sign_in_other_browser(email_accounts):
    state = email_accounts
    original = register(state)
    status = state.owner.get("/auth/email/status")
    assert status.status_code == 200  # GET does not require a JSON Content-Type.
    assert status.headers["Cache-Control"] == "no-store"
    assert status.json()["verified"] is False
    token = request_token(state, "verify")
    assert state.owner.get("/auth/email/status").json()["verified"] is False
    response = consume(state, "verify", token)
    assert response.status_code == 200
    assert "set-cookie" not in response.headers
    assert state.visitor.get("/savings/session").status_code == 401
    assert state.owner.get("/savings/session").json() == original
    assert state.owner.get("/auth/email/status").json()["verified"] is True
    assert consume(state, "verify", token).status_code == 400
    assert state.owner.post("/auth/email/request", json={}).status_code == 202
    assert len(state.sent) == 1


@pytest.mark.parametrize("purpose", ["reset", "verify"])
def test_tokens_are_hashed_durable_and_expire_at_the_boundary(email_accounts, purpose):
    state = email_accounts
    register(state)
    token = request_token(state, purpose)
    with sqlite3.connect(state.path) as conn:
        row = conn.execute("SELECT token_hash, purpose, expires_at FROM savings_email_tokens").fetchone()
        assert row[0] == hashlib.sha256(token.encode()).hexdigest()
        assert row[1] == purpose
        expected_seconds = account_email.RESET_SECONDS if purpose == "reset" else account_email.VERIFY_SECONDS
        assert int(time.time()) < row[2] <= int(time.time()) + expected_seconds
        conn.execute("UPDATE savings_email_tokens SET expires_at=?", (int(time.time()),))
    assert token.encode() not in state.path.read_bytes()
    assert consume(state, purpose, token).status_code == 400


@pytest.mark.parametrize("purpose", ["reset", "verify"])
def test_new_request_supersedes_old_token_and_success_cannot_be_replayed(email_accounts, purpose):
    state = email_accounts
    register(state)
    previous = request_token(state, purpose)
    current = request_token(state, purpose)
    assert previous != current
    assert consume(state, purpose, previous).status_code == 400
    assert consume(state, purpose, current).status_code == 200
    assert consume(state, purpose, current).status_code == 400


def test_reset_and_verification_tokens_cannot_substitute_for_each_other(email_accounts):
    state = email_accounts
    register(state)
    reset = request_token(state, "reset")
    verify = request_token(state, "verify")
    assert consume(state, "verify", reset).status_code == 400
    assert consume(state, "reset", verify).status_code == 400
    assert consume(state, "verify", verify).status_code == 200
    assert consume(state, "reset", reset).status_code == 200


def test_tokens_survive_fresh_client_and_verification_does_not_lock_out_existing_users(email_accounts):
    state = email_accounts
    original = register(state)
    token = request_token(state, "verify")
    with TestClient(app) as fresh:
        assert fresh.post("/auth/email/verify", json={"token": token}).status_code == 200
        assert fresh.post("/auth/login", json={"email": ACCOUNT["email"], "password": PASSWORD}).json() == original
        assert fresh.get("/auth/email/status").json()["verified"] is True


def test_unknown_and_google_only_accounts_do_not_reveal_existence_or_gain_passwords(email_accounts):
    state = email_accounts
    register(state)
    expected = state.visitor.post("/auth/password/forgot", json={"email": ACCOUNT["email"]})
    with sqlite3.connect(state.path) as conn:
        conn.execute("INSERT INTO savings_users VALUES (?, ?)", ("provider-user", "Provider user"))
        conn.execute("INSERT INTO savings_google_accounts VALUES (?, ?, ?)", ("provider-sub", "provider-user", "provider@example.com"))
    for email in ("unknown@example.com", "provider@example.com"):
        response = state.visitor.post("/auth/password/forgot", json={"email": email})
        assert (response.status_code, response.json()) == (expected.status_code, expected.json())
    assert len(state.sent) == 1
    with sqlite3.connect(state.path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_credentials").fetchone()[0] == 1


def test_delivery_unavailable_is_independent_of_account_existence(email_accounts, monkeypatch):
    state = email_accounts
    register(state)
    monkeypatch.setattr(account_mail, "delivery_available", lambda: False)
    for email in (ACCOUNT["email"], "unknown@example.com"):
        response = state.visitor.post("/auth/password/forgot", json={"email": email})
        assert response.status_code == 503
        assert response.json() == {"detail": account_email.UNAVAILABLE}
        assert response.headers["Cache-Control"] == "no-store"
    assert state.owner.post("/auth/email/request", json={}).status_code == 503
    assert not state.sent
    assert state.owner.get("/auth/email/status").json()["delivery_available"] is False


def test_provider_failure_keeps_forgot_response_generic_and_invalidates_undelivered_token(email_accounts, monkeypatch):
    state = email_accounts
    register(state)
    def fail(*_):
        raise account_mail.MailDeliveryError()
    monkeypatch.setattr(account_mail, "send_account_email", fail)
    known = state.visitor.post("/auth/password/forgot", json={"email": ACCOUNT["email"]})
    unknown = state.visitor.post("/auth/password/forgot", json={"email": "unknown@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    verification = state.owner.post("/auth/email/request", json={})
    assert verification.status_code == 503
    assert "private" not in known.text + verification.text
    with sqlite3.connect(state.path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_email_tokens").fetchone()[0] == 0


def test_failed_old_delivery_does_not_remove_a_newer_token(email_accounts, monkeypatch):
    state = email_accounts
    register(state)
    original_sender = account_mail.send_account_email
    def supersede_then_fail(email, purpose, token):
        with account_email.database(state.path, write=True) as conn:
            credential = conn.execute("SELECT user_id, email, password_hash FROM savings_credentials").fetchone()
            replacement = account_email.issue_token(conn, credential, purpose)
        state.sent.append((email, purpose, replacement))
        raise account_mail.MailDeliveryError()
    monkeypatch.setattr(account_mail, "send_account_email", supersede_then_fail)
    assert state.visitor.post("/auth/password/forgot", json={"email": ACCOUNT["email"]}).status_code == 202
    replacement = state.sent[-1][2]
    monkeypatch.setattr(account_mail, "send_account_email", original_sender)
    assert consume(state, "reset", replacement).status_code == 200


def test_notification_failure_does_not_undo_successful_password_reset(email_accounts, monkeypatch):
    state = email_accounts
    register(state)
    token = request_token(state, "reset")
    def fail_notice(_):
        raise account_mail.MailDeliveryError()
    monkeypatch.setattr(account_mail, "send_password_changed_email", fail_notice)
    assert consume(state, "reset", token).status_code == 200
    assert state.visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": NEW_PASSWORD}).status_code == 200


def test_revoked_session_cannot_request_verification(email_accounts, monkeypatch):
    state = email_accounts
    identity = register(state)
    def revoke(*_):
        with sqlite3.connect(state.path) as conn:
            conn.execute("DELETE FROM savings_sessions WHERE user_id=?", (identity["user_id"],))
    monkeypatch.setattr(account_email, "check_attempts", revoke)
    assert state.owner.post("/auth/email/request", json={}).status_code == 401
    assert not state.sent


def test_token_consumed_while_hashing_cannot_reset_password_twice(email_accounts, monkeypatch):
    state = email_accounts
    register(state)
    token = request_token(state, "reset")
    original_hash = account_email.hash_password
    def consume_during_hash(password):
        with sqlite3.connect(state.path) as conn:
            conn.execute("DELETE FROM savings_email_tokens")
        return original_hash(password)
    monkeypatch.setattr(account_email, "hash_password", consume_during_hash)
    assert consume(state, "reset", token).status_code == 400
    assert state.visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": PASSWORD}).status_code == 200
    assert not state.notices


def test_background_token_commit_failure_does_not_send_a_link_or_expose_account(email_accounts, monkeypatch, caplog):
    state = email_accounts
    register(state)
    real_database = account_email.database
    @contextmanager
    def failed_commit(path, *, write=False):
        with real_database(path, write=write) as conn:
            yield conn
            if write:
                raise sqlite3.OperationalError("Remote savings commit failed")
    monkeypatch.setattr(account_email, "database", failed_commit)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post("/auth/password/forgot", json={"email": ACCOUNT["email"]})
        assert response.status_code == 202
        assert response.json() == {"message": account_email.FORGOT_MESSAGE}
    assert not state.sent
    assert "Password reset email preparation failed." in caplog.text
    assert ACCOUNT["email"] not in caplog.text
    with sqlite3.connect(state.path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_email_tokens").fetchone()[0] == 0


@pytest.mark.parametrize("purpose", ["reset", "verify"])
def test_consumption_commit_failure_preserves_token_credentials_and_sessions(email_accounts, monkeypatch, purpose):
    state = email_accounts
    original = register(state)
    token = request_token(state, purpose)
    real_database = account_email.database
    @contextmanager
    def failed_commit(path, *, write=False):
        with real_database(path, write=write) as conn:
            yield conn
            if write:
                raise sqlite3.OperationalError("Remote savings commit failed")
    monkeypatch.setattr(account_email, "database", failed_commit)
    route = "/auth/password/reset" if purpose == "reset" else "/auth/email/verify"
    body = {"token": token, **({"password": NEW_PASSWORD} if purpose == "reset" else {})}
    with TestClient(app, raise_server_exceptions=False) as client:
        assert client.post(route, json=body).status_code == 500
    monkeypatch.setattr(account_email, "database", real_database)
    assert state.owner.get("/savings/session").json() == original
    assert state.owner.get("/auth/email/status").json()["verified"] is False
    assert not state.notices
    with sqlite3.connect(state.path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_email_tokens WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()[0] == 1
        encoded = conn.execute("SELECT password_hash FROM savings_credentials").fetchone()[0]
        assert auth_api.verify_password(PASSWORD, encoded)
    assert consume(state, purpose, token).status_code == 200


@pytest.mark.parametrize("purpose", ["reset", "verify"])
def test_credential_change_invalidates_preexisting_email_links(email_accounts, purpose):
    state = email_accounts
    register(state)
    token = request_token(state, purpose)
    with sqlite3.connect(state.path) as conn:
        conn.execute("UPDATE savings_credentials SET password_hash=?", (auth_api.hash_password(NEW_PASSWORD),))
    assert consume(state, purpose, token).status_code == 400
    assert not state.notices


def test_successful_reset_clears_only_the_accounts_login_lockout(email_accounts):
    state = email_accounts
    register(state)
    for _ in range(10):
        assert state.visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": "incorrect"}).status_code == 401
    assert state.visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": PASSWORD}).status_code == 429
    token = request_token(state, "reset")
    assert consume(state, "reset", token).status_code == 200
    with sqlite3.connect(state.path) as conn:
        assert conn.execute("SELECT count(*) FROM auth_attempts WHERE scope=?", (auth_api.email_scope("login", ACCOUNT["email"]),)).fetchone()[0] == 0
        assert conn.execute("SELECT attempts FROM auth_attempts WHERE scope LIKE 'login:ip:%'").fetchone()[0] == 10
    assert state.visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": NEW_PASSWORD}).status_code == 200


def test_rate_limits_apply_even_for_unknown_email(email_accounts):
    state = email_accounts
    for _ in range(10):
        assert state.visitor.post("/auth/password/forgot", json={"email": "unknown@example.com"}).status_code == 202
    blocked = state.visitor.post("/auth/password/forgot", json={"email": "unknown@example.com"})
    assert blocked.status_code == 429
    assert 0 < int(blocked.headers["Retry-After"]) <= 900
    assert blocked.headers["Cache-Control"] == "no-store"
    assert not state.sent


@pytest.mark.parametrize("path, body", [
    ("/auth/password/forgot", {"email": "ada@example.com"}),
    ("/auth/password/reset", {"token": "private-token", "password": NEW_PASSWORD}),
    ("/auth/email/verify", {"token": "private-token"}),
    ("/auth/email/request", {}),
])
def test_all_email_writes_reject_untrusted_origins(email_accounts, path, body):
    state = email_accounts
    register(state)
    response = state.owner.post(path, json=body, headers={"Origin": "https://untrusted.example"})
    assert response.status_code == 403
    assert not state.sent


@pytest.mark.parametrize("path, body", [
    ("/auth/password/reset", {"token": "private-token", "password": "short-private-password"[:8]}),
    ("/auth/email/verify", {"token": "private-token", "extra": "private-input"}),
    ("/auth/password/forgot", {"email": "private-invalid-email"}),
])
def test_validation_never_echoes_reset_secrets(email_accounts, path, body):
    response = email_accounts.visitor.post(path, json=body)
    assert response.status_code == 422
    assert response.headers["Cache-Control"] == "no-store"
    assert "private" not in response.text
    assert set(response.json()) == {"detail"}


def test_guest_and_google_only_status_have_no_password_mailbox(email_accounts):
    state = email_accounts
    identity = state.owner.post("/savings/session", json={"display_name": "Guest"}).json()
    expected = {"email": None, "verified": False, "delivery_available": True}
    assert state.owner.get("/auth/email/status").json() == expected
    assert state.owner.post("/auth/email/request", json={}).status_code == 409
    with sqlite3.connect(state.path) as conn:
        conn.execute("INSERT INTO savings_google_accounts VALUES (?, ?, ?)", ("provider-sub", identity["user_id"], "provider@example.com"))
    assert state.owner.get("/auth/email/status").json() == expected
    assert not state.sent


def test_email_status_does_not_mark_a_changed_credential_email_verified(email_accounts):
    state = email_accounts
    register(state)
    token = request_token(state, "verify")
    assert consume(state, "verify", token).status_code == 200
    with sqlite3.connect(state.path) as conn:
        conn.execute("UPDATE savings_credentials SET email='different@example.com'")
    status = state.owner.get("/auth/email/status").json()
    assert status["email"] == "different@example.com"
    assert status["verified"] is False

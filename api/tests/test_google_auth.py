"""Signed Google tokens retain SQLite ownership and cannot link accounts by email."""
from datetime import date, timedelta
import hashlib
import json
import sqlite3
import time
from types import SimpleNamespace

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from google.auth import crypt, exceptions, jwt
import pytest

from api import google_auth
from api.main import app
from api.savings import COOKIE, get_savings_path


CLIENT_ID = "ajora-test.apps.googleusercontent.com"
PASSWORD = "a private password for testing"
EMAIL = "ada@example.com"


@pytest.fixture(scope="module")
def signing_keys():
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                      serialization.NoEncryption())
    public_pem = private.public_key().public_bytes(serialization.Encoding.PEM,
                                                 serialization.PublicFormat.SubjectPublicKeyInfo)
    return crypt.RSASigner.from_string(private_pem, key_id="test-key"), public_pem.decode()


@pytest.fixture
def google(tmp_path, monkeypatch, signing_keys):
    signer, public_pem = signing_keys
    monkeypatch.setenv("AJORA_GOOGLE_CLIENT_ID", CLIENT_ID)
    path = tmp_path / "savings.sqlite3"
    app.dependency_overrides[get_savings_path] = lambda: path
    calls = []

    class CertificateRequest:
        def __call__(self, url, method="GET", timeout=None, **kwargs):
            calls.append((url, timeout))
            return SimpleNamespace(status=200, data=json.dumps({"test-key": public_pem}).encode())

    monkeypatch.setattr(google_auth, "GoogleRequest", CertificateRequest)

    def token(challenge_nonce, **overrides):
        stamp = int(time.time())
        return jwt.encode(signer, {
            "iss": "https://accounts.google.com", "aud": CLIENT_ID, "sub": "google-ada",
            "iat": stamp - 1, "exp": stamp + 120, "email": EMAIL, "email_verified": True,
            "name": "Google Ada", "nonce": challenge_nonce, **overrides,
        }).decode()

    with TestClient(app) as owner, TestClient(app) as visitor:
        yield owner, visitor, path, token, calls
    app.dependency_overrides.pop(get_savings_path, None)


def start(client):
    response = client.post("/auth/google/challenge", json={})
    assert response.status_code == 200, response.text
    assert response.json()["client_id"] == CLIENT_ID
    assert response.headers["Cache-Control"] == "no-store"
    return response.json()["nonce"]


def login(client, token, **claims):
    return client.post("/auth/google", json={"credential": token(start(client), **claims)})


def circle(client):
    response = client.post("/savings/circles", json={
        "name": "Google savings", "contribution_kobo": 100_000, "frequency": "monthly",
        "member_limit": 2, "start_date": (date.today() + timedelta(days=2)).isoformat(),
    })
    assert response.status_code == 201
    return response.json()


def test_signed_google_login_persists_identity_across_devices_and_logout(google):
    owner, visitor, path, token, calls = google
    nonce = start(owner)
    credential = token(nonce)
    response = owner.post("/auth/google", json={"credential": credential})
    assert response.status_code == 200, response.text
    identity = response.json()
    assert identity["email"] == EMAIL
    assert identity["google_linked"] is True
    assert identity["display_name"] == "Google Ada"
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "Max-Age=2592000" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]
    assert owner.get("/savings/session").json() == identity
    saved = circle(owner)
    returned = login(visitor, token, name="Changed Google name")
    assert returned.status_code == 200
    assert returned.json() == identity
    assert visitor.get(f"/savings/circles/{saved['id']}").status_code == 200
    assert visitor.post("/savings/logout", json={}).status_code == 204
    assert visitor.get("/savings/session").status_code == 401
    assert owner.get("/savings/session").status_code == 200
    assert all(timeout == 5 for _, timeout in calls)
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_users").fetchone()[0] == 1
        assert conn.execute("SELECT count(*) FROM savings_google_challenges").fetchone()[0] == 0
        assert conn.execute("SELECT count(*) FROM savings_credentials").fetchone()[0] == 0
    assert credential.encode() not in path.read_bytes()
    assert nonce.encode() not in path.read_bytes()


@pytest.mark.parametrize("claims", [
    {"aud": "another-client"}, {"iss": "https://attacker.example"},
    {"exp": 1}, {"exp": "invalid"}, {"iat": 9_999_999_999}, {"iat": None},
    {"iss": None}, {"nonce": "wrong"}, {"nonce": "é"}, {"nonce": None},
    {"email_verified": False}, {"email_verified": "true"}, {"email": "invalid"},
    {"sub": ""}, {"sub": None},
])
def test_invalid_signed_claims_cannot_create_account(google, claims):
    owner, _, path, token, _ = google
    response = login(owner, token, **claims)
    assert response.status_code == 401, response.text
    assert COOKIE not in owner.cookies
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_users").fetchone()[0] == 0


def test_bad_signature_and_malformed_tokens_are_rejected_without_echo(google):
    owner, _, _, token, _ = google
    nonce = start(owner)
    signed = token(nonce)
    parts = signed.split(".")
    # Keep valid JSON claims while changing the signed content.
    parts[1] = parts[1][:-1] + ("A" if parts[1][-1] != "A" else "B")
    for credential in (".".join(parts), "secret-invalid-google-token"):
        response = owner.post("/auth/google", json={"credential": credential})
        assert response.status_code == 401
        assert credential not in response.text
    response = owner.post("/auth/google", json={"credential": "x" * 16_385})
    assert response.status_code == 422
    assert "input" not in response.json()
    assert response.headers["Cache-Control"] == "no-store"


def test_challenges_require_same_browser_and_are_expiring_single_use(google):
    owner, visitor, path, token, _ = google
    nonce = start(owner)
    credential = token(nonce)
    assert visitor.post("/auth/google", json={"credential": credential}).status_code == 401
    start(visitor)
    assert visitor.post("/auth/google", json={"credential": credential}).status_code == 401
    cookie = owner.cookies.get(google_auth.NONCE_COOKIE)
    assert owner.post("/auth/google", json={"credential": credential}).status_code == 200
    owner.cookies.set(google_auth.NONCE_COOKIE, cookie)
    assert owner.post("/auth/google", json={"credential": credential}).status_code == 401
    nonce = start(visitor)
    with sqlite3.connect(path) as conn:
        conn.execute("UPDATE savings_google_challenges SET expires_at=0")
    assert visitor.post("/auth/google", json={"credential": token(nonce)}).status_code == 401


def test_challenge_keeps_an_open_popup_valid_across_other_tab_mounts(google):
    owner, _, _, token, _ = google
    first = start(owner)
    assert start(owner) == first
    assert owner.post("/auth/google", json={"credential": token(first)}).status_code == 200


def test_guest_upgrade_preserves_circles_and_retires_old_sessions_and_keys(google):
    owner, visitor, path, token, _ = google
    original = owner.post("/savings/session", json={"display_name": "Existing Ada"}).json()
    saved = circle(owner)
    key = owner.post("/savings/recovery-key", json={}).json()["recovery_key"]
    old_cookie = owner.cookies.get(COOKIE)
    upgraded = login(owner, token)
    assert upgraded.status_code == 200
    assert upgraded.json() == {**original, "email": EMAIL, "google_linked": True}
    assert owner.get(f"/savings/circles/{saved['id']}").status_code == 200
    assert owner.post("/savings/recovery-key", json={}).status_code == 403
    visitor.cookies.set(COOKIE, old_cookie)
    assert visitor.get("/savings/session").status_code == 401
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_recovery_keys").fetchone()[0] == 0
        conn.execute("INSERT INTO savings_recovery_keys VALUES (?, ?)",
                     (original["user_id"], hashlib.sha256(key.encode()).hexdigest()))
    assert visitor.post("/savings/recover", json={"recovery_key": key}).status_code == 401


def test_password_user_explicitly_links_google_and_can_use_either_login(google):
    owner, visitor, _, token, _ = google
    original = owner.post("/auth/register", json={"display_name": "Password Ada", "email": EMAIL,
                                                "password": PASSWORD}).json()
    saved = circle(owner)
    blocked = login(visitor, token)
    assert blocked.status_code == 409
    assert "then link Google" in blocked.json()["detail"]
    linked = login(owner, token)
    assert linked.status_code == 200
    assert linked.json() == {**original, "google_linked": True}
    assert login(visitor, token).json() == linked.json()
    assert visitor.get(f"/savings/circles/{saved['id']}").status_code == 200
    visitor.post("/savings/logout", json={})
    assert visitor.post("/auth/login", json={"email": EMAIL, "password": PASSWORD}).json() == linked.json()


def test_linking_does_not_merge_other_users_or_mismatched_emails(google):
    owner, visitor, path, token, _ = google
    first = login(owner, token).json()
    second = visitor.post("/auth/register", json={"display_name": "Other user", "email": "other@example.com",
                                                "password": PASSWORD}).json()
    assert login(visitor, token).status_code == 409
    assert login(visitor, token, sub="different-google-id").status_code == 409
    assert visitor.get("/savings/session").json() == second
    assert login(owner, token, sub="different-google-id").status_code == 409
    assert owner.get("/savings/session").json() == first
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_google_accounts").fetchone()[0] == 1


def test_password_registration_cannot_claim_google_email_or_identity(google):
    owner, visitor, path, token, _ = google
    original = login(owner, token).json()
    account = {"display_name": "Attacker", "email": EMAIL, "password": PASSWORD}
    assert visitor.post("/auth/register", json=account).status_code == 409
    assert owner.post("/auth/register", json={**account, "email": "different@example.com"}).status_code == 409
    assert owner.get("/savings/session").json() == original
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_credentials").fetchone()[0] == 0


def test_sub_is_identity_even_when_google_email_changes(google):
    owner, visitor, _, token, _ = google
    original = login(owner, token).json()
    returned = login(visitor, token, email="new@example.com")
    assert returned.status_code == 200
    assert returned.json()["user_id"] == original["user_id"]
    assert returned.json()["email"] == "new@example.com"


def test_challenge_binding_rejects_session_changes_during_google_popup(google):
    owner, visitor, path, token, _ = google
    nonce = start(owner)
    owner.post("/savings/session", json={"display_name": "New profile"})
    assert owner.post("/auth/google", json={"credential": token(nonce)}).status_code == 401
    nonce = start(owner)
    with sqlite3.connect(path) as conn:
        conn.execute("DELETE FROM savings_sessions")
    assert owner.post("/auth/google", json={"credential": token(nonce)}).status_code == 401
    owner.cookies.clear()
    guest = owner.post("/savings/session", json={"display_name": "Recoverable profile"}).json()
    key = owner.post("/savings/recovery-key", json={}).json()["recovery_key"]
    nonce = start(owner)
    original_verify = google_auth.id_token.verify_oauth2_token

    def revoke_during_verification(*args, **kwargs):
        recovered = visitor.post("/savings/recover", json={"recovery_key": key})
        assert recovered.json() == guest
        return original_verify(*args, **kwargs)

    google_auth.id_token.verify_oauth2_token = revoke_during_verification
    try:
        assert owner.post("/auth/google", json={"credential": token(nonce)}).status_code == 401
    finally:
        google_auth.id_token.verify_oauth2_token = original_verify


def test_missing_configuration_external_failure_and_origin_protection(google, monkeypatch):
    owner, _, _, token, _ = google
    assert owner.post("/auth/google/challenge", json={}, headers={"Origin": "https://evil.example"}).status_code == 403
    assert owner.post("/auth/google/challenge", data={}).status_code == 415
    assert owner.post("/auth/google", json={"credential": "x"}, headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    nonce = start(owner)

    def unavailable(*args, **kwargs):
        raise exceptions.TransportError("private upstream detail")

    monkeypatch.setattr(google_auth.id_token, "verify_oauth2_token", unavailable)
    response = owner.post("/auth/google", json={"credential": token(nonce)})
    assert response.status_code == 503
    assert "private upstream" not in response.text
    monkeypatch.delenv("AJORA_GOOGLE_CLIENT_ID")
    assert owner.post("/auth/google/challenge", json={}).status_code == 503
    assert owner.post("/auth/google", json={"credential": "secret"}).status_code == 503


def test_google_attempts_are_limited(google):
    owner, _, path, _, _ = google
    start(owner)
    with sqlite3.connect(path) as conn:
        conn.execute("UPDATE auth_attempts SET attempts=50")
    response = owner.post("/auth/google/challenge", json={})
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 0

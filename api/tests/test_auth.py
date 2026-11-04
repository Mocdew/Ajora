"""Registration/login preserve savings ownership and never expose credentials."""
from datetime import date, timedelta
import hashlib
import sqlite3
import time

from fastapi.testclient import TestClient
import pytest

from api.main import app
from api import auth as auth_api
from api.savings import COOKIE, get_savings_path


PASSWORD = "my long private passphrase"
ACCOUNT = {"display_name": "Ada", "email": "ada@example.com", "password": PASSWORD}


@pytest.fixture
def auth(tmp_path):
    path = tmp_path / "savings.sqlite3"
    app.dependency_overrides[get_savings_path] = lambda: path
    with TestClient(app) as owner, TestClient(app) as visitor:
        yield owner, visitor, path
    app.dependency_overrides.pop(get_savings_path, None)


def test_register_and_login_across_devices_persist_same_identity(auth):
    owner, visitor, path = auth
    response = owner.post("/auth/register", json={**ACCOUNT, "email": " ADA@Example.COM "})
    assert response.status_code == 201
    assert response.headers["Cache-Control"] == "no-store"
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]
    original = response.json()
    assert original["email"] == "ada@example.com"
    assert set(original) == {"user_id", "display_name", "email", "google_linked"}
    assert original["google_linked"] is False
    cookie = owner.cookies.get(COOKIE)
    with sqlite3.connect(path) as conn:
        stored = conn.execute("SELECT password_hash FROM savings_credentials").fetchone()[0]
        assert stored.startswith("pbkdf2_sha256$600000$")
        assert stored != PASSWORD
        assert conn.execute("SELECT token_hash FROM savings_sessions").fetchone()[0] == hashlib.sha256(cookie.encode()).hexdigest()
    assert PASSWORD.encode() not in path.read_bytes()
    logged_in = visitor.post("/auth/login", json={"email": "ADA@EXAMPLE.COM", "password": PASSWORD})
    assert logged_in.status_code == 200
    assert logged_in.json() == original
    assert visitor.cookies.get(COOKIE) != cookie
    assert visitor.get("/savings/session").json() == original
    assert visitor.get("/savings/session").headers["Cache-Control"] == "no-store"
    assert visitor.post("/savings/logout", json={}).status_code == 204
    assert visitor.get("/savings/session").status_code == 401
    assert owner.get("/savings/session").status_code == 200


def test_cookie_secure_flag_is_supported(auth, monkeypatch):
    owner, _, _ = auth
    monkeypatch.setenv("AJORA_COOKIE_SECURE", "true")
    response = owner.post("/auth/register", json=ACCOUNT)
    assert response.status_code == 201
    assert "Secure" in response.headers["set-cookie"]


def test_guest_upgrade_preserves_membership_and_retires_legacy_access(auth):
    owner, visitor, path = auth
    guest = owner.post("/savings/session", json={"display_name": "Existing Ada"}).json()
    assert guest["email"] is None
    old_cookie = owner.cookies.get(COOKIE)
    key = owner.post("/savings/recovery-key", json={}).json()["recovery_key"]
    circle = owner.post("/savings/circles", json={
        "name": "Family savings", "contribution_kobo": 10_000,
        "frequency": "monthly", "member_limit": 2,
        "start_date": (date.today() + timedelta(days=2)).isoformat(),
    }).json()
    upgraded = owner.post("/auth/register", json=ACCOUNT)
    assert upgraded.status_code == 201
    assert upgraded.json() == {**guest, "email": ACCOUNT["email"]}
    assert owner.cookies.get(COOKIE) != old_cookie
    assert owner.get(f"/savings/circles/{circle['id']}").status_code == 200
    visitor.cookies.set(COOKIE, old_cookie)
    assert visitor.get("/savings/session").status_code == 401
    visitor.cookies.clear()
    assert visitor.post("/savings/recover", json={"recovery_key": key}).status_code == 401
    assert owner.post("/savings/recovery-key", json={}).status_code == 403
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_users").fetchone()[0] == 1
        assert conn.execute("SELECT count(*) FROM savings_recovery_keys").fetchone()[0] == 0
        # A stale/manually restored key still cannot access an email/password account.
        conn.execute("INSERT INTO savings_recovery_keys VALUES (?, ?)", (guest["user_id"], hashlib.sha256(key.encode()).hexdigest()))
    assert visitor.post("/savings/recover", json={"recovery_key": key}).status_code == 401
    assert visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": PASSWORD}).status_code == 200
    assert visitor.get(f"/savings/circles/{circle['id']}").status_code == 200


def test_duplicate_registration_does_not_create_or_replace_users(auth):
    owner, visitor, path = auth
    original = owner.post("/auth/register", json=ACCOUNT).json()
    assert visitor.post("/auth/register", json={**ACCOUNT, "email": "ADA@example.com"}).status_code == 409
    assert visitor.get("/savings/session").status_code == 401
    assert owner.post("/auth/register", json={**ACCOUNT, "email": "new@example.com"}).status_code == 409
    assert owner.get("/savings/session").json() == original
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_users").fetchone()[0] == 1


def test_guest_registration_cannot_use_session_revoked_during_hashing(auth, monkeypatch):
    owner, visitor, path = auth
    guest = owner.post("/savings/session", json={"display_name": "Ada"}).json()
    key = owner.post("/savings/recovery-key", json={}).json()["recovery_key"]
    original_hash = auth_api.hash_password

    def recover_while_hashing(password):
        recovered = visitor.post("/savings/recover", json={"recovery_key": key})
        assert recovered.status_code == 200
        assert recovered.json() == guest
        assert owner.get("/savings/session").status_code == 401
        return original_hash(password)

    monkeypatch.setattr(auth_api, "hash_password", recover_while_hashing)
    response = owner.post("/auth/register", json=ACCOUNT)
    assert response.status_code == 401
    assert visitor.get("/savings/session").json() == guest
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_credentials").fetchone()[0] == 0
        assert conn.execute("SELECT count(*) FROM savings_users").fetchone()[0] == 1


def test_login_does_not_silently_replace_an_existing_guest(auth):
    owner, visitor, _ = auth
    owner.post("/auth/register", json=ACCOUNT)
    guest = visitor.post("/savings/session", json={"display_name": "Bisi"}).json()
    assert visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": PASSWORD}).status_code == 409
    assert visitor.get("/savings/session").json() == guest


def test_bad_credentials_are_generic_and_do_not_issue_a_session(auth):
    owner, visitor, _ = auth
    owner.post("/auth/register", json=ACCOUNT)
    known = visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": "wrong password"})
    unknown = visitor.post("/auth/login", json={"email": "unknown@example.com", "password": "wrong password"})
    assert known.status_code == unknown.status_code == 401
    assert known.json() == unknown.json() == {"detail": "Email or password is incorrect."}
    assert COOKIE not in visitor.cookies


@pytest.mark.parametrize("override", [
    {"email": "invalid"}, {"email": "x..y@example.com"}, {"password": "short"},
    {"password": "x" * 129}, {"display_name": " "}, {"unexpected": "value"},
])
def test_registration_validation_never_echoes_passwords(auth, override):
    owner, _, _ = auth
    response = owner.post("/auth/register", json={**ACCOUNT, **override})
    assert response.status_code == 422
    assert "input" not in response.json()
    assert PASSWORD not in response.text
    assert response.headers["Cache-Control"] == "no-store"
    assert owner.get("/savings/session").status_code == 401


def test_password_whitespace_is_preserved_and_salts_are_unique(auth):
    owner, visitor, path = auth
    password = "  a very long passphrase  "
    assert owner.post("/auth/register", json={**ACCOUNT, "password": password}).status_code == 201
    assert visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": password.strip()}).status_code == 401
    assert visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": password}).status_code == 200
    visitor.post("/savings/logout", json={})
    assert visitor.post("/auth/register", json={**ACCOUNT, "email": "bisi@example.com", "password": password}).status_code == 201
    with sqlite3.connect(path) as conn:
        hashes = [row[0] for row in conn.execute("SELECT password_hash FROM savings_credentials")]
        assert len(set(hashes)) == 2


def test_cookie_authenticated_account_requests_reject_cross_site_and_form_posts(auth, monkeypatch):
    owner, _, _ = auth
    assert owner.post("/auth/register", json=ACCOUNT, headers={"Origin": "https://evil.example"}).status_code == 403
    assert owner.post("/auth/register", json=ACCOUNT, headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert owner.post("/auth/register", data=ACCOUNT).status_code == 415
    assert owner.post("/auth/register", json=ACCOUNT, headers={"Origin": "http://["}).status_code == 403
    assert owner.post("/auth/register", json=ACCOUNT, headers={"Origin": "https://evil.example", "X-Forwarded-Host": "evil.example"}).status_code == 403
    monkeypatch.setenv("AJORA_AUTH_ORIGINS", "https://ajora.example")
    allowed = owner.post("/auth/register", json=ACCOUNT, headers={"Origin": "https://ajora.example"})
    assert allowed.status_code == 201
    assert owner.post("/savings/logout", json={}, headers={"Origin": "https://evil.example"}).status_code == 403
    assert owner.get("/savings/session").status_code == 200


@pytest.mark.parametrize("origin", ["http://localhost:3200", "http://127.0.0.1:3200"])
def test_port_3200_supports_registration_login_and_cors(auth, origin):
    owner, visitor, _ = auth
    headers = {"Origin": origin}
    assert owner.post("/auth/register", json=ACCOUNT, headers=headers).status_code == 201
    assert visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": PASSWORD}, headers=headers).status_code == 200
    preflight = visitor.options("/auth/login", headers={
        **headers, "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert preflight.status_code == 200
    assert preflight.headers["Access-Control-Allow-Origin"] == origin


def test_login_throttling_expires_and_success_resets_email_limit(auth):
    owner, visitor, path = auth
    owner.post("/auth/register", json=ACCOUNT)
    for _ in range(10):
        assert visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": "wrong"}).status_code == 401
    blocked = visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": PASSWORD})
    assert blocked.status_code == 429
    assert 0 < int(blocked.headers["Retry-After"]) <= 900
    with sqlite3.connect(path) as conn:
        conn.execute("UPDATE auth_attempts SET started_at=?", (int(time.time()) - 901,))
    assert visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": PASSWORD}).status_code == 200
    with sqlite3.connect(path) as conn:
        email_key = "login:email:" + hashlib.sha256(ACCOUNT["email"].encode()).hexdigest()
        assert conn.execute("SELECT count(*) FROM auth_attempts WHERE scope=?", (email_key,)).fetchone()[0] == 0


def test_registered_circle_members_do_not_expose_private_email_and_require_membership(auth):
    owner, visitor, path = auth
    owner.post("/auth/register", json=ACCOUNT)
    visitor.post("/auth/register", json={**ACCOUNT, "display_name": "Bisi", "email": "bisi@example.com"})
    created = owner.post("/savings/circles", json={
        "name": "Family savings", "contribution_kobo": 10_000,
        "frequency": "monthly", "member_limit": 2,
        "start_date": (date.today() + timedelta(days=2)).isoformat(),
    })
    assert created.status_code == 201
    circle = created.json()
    assert visitor.get(f"/savings/circles/{circle['id']}").status_code == 403
    joined = visitor.post("/savings/join", json={"invite_code": circle["invite_code"]})
    assert joined.status_code == 200
    assert "email" not in joined.text
    assert ACCOUNT["email"] not in joined.text
    with sqlite3.connect(path) as conn:
        stored = conn.execute("SELECT document FROM savings_circles").fetchone()[0]
        assert "email" not in stored


def test_auth_validation_schema_matches_redacted_error_response():
    schema = app.openapi()
    for operation in ("/auth/register", "/auth/login"):
        response = schema["paths"][operation]["post"]["responses"]["422"]
        assert response["content"]["application/json"]["schema"]["$ref"].endswith("/AuthErrorResponse")
    assert schema["components"]["schemas"]["AuthErrorResponse"]["properties"]["detail"]["type"] == "string"


def test_password_reset_during_login_hashing_cannot_issue_an_old_password_session(auth, monkeypatch):
    owner, visitor, path = auth
    identity = owner.post("/auth/register", json=ACCOUNT).json()
    original_verify = auth_api.verify_password
    replacement_hash = auth_api.hash_password("a new private password after reset")
    def reset_while_verifying(password, encoded):
        valid = original_verify(password, encoded)
        with sqlite3.connect(path) as conn:
            conn.execute("UPDATE savings_credentials SET password_hash=? WHERE user_id=?", (replacement_hash, identity["user_id"]))
            conn.execute("DELETE FROM savings_sessions WHERE user_id=?", (identity["user_id"],))
        return valid
    monkeypatch.setattr(auth_api, "verify_password", reset_while_verifying)
    assert visitor.post("/auth/login", json={"email": ACCOUNT["email"], "password": PASSWORD}).status_code == 401
    assert visitor.get("/savings/session").status_code == 401
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_sessions").fetchone()[0] == 0

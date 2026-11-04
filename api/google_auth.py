"""Google sign-in and explicit account linking over the existing SQLite sessions."""
from __future__ import annotations

from functools import partial
import hashlib
import hmac
import os
from pathlib import Path
import secrets
import sqlite3
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from google.auth import exceptions as google_errors
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from pydantic import BaseModel, ConfigDict, Field

from .auth import ATTEMPT_WINDOW, AuthErrorResponse, LoginInput, issue_session, set_session_cookie
from .savings import COOKIE, EmptyInput, Session, database, get_savings_path, require_identity_request, session_user


router = APIRouter(
    prefix="/auth/google", tags=["auth"], dependencies=[Depends(require_identity_request)],
    responses={422: {"model": AuthErrorResponse}},
)
NONCE_COOKIE = "ajora_google_nonce"
CHALLENGE_SECONDS = 300


class GoogleChallenge(BaseModel):
    client_id: str
    nonce: str


class GoogleCredential(BaseModel):
    model_config = ConfigDict(extra="forbid")
    credential: str = Field(min_length=1, max_length=16_384, strict=True, repr=False)


def failure(status: int, detail: str) -> HTTPException:
    return HTTPException(status, detail, headers={"Cache-Control": "no-store"})


def client_id() -> str:
    value = os.environ.get("AJORA_GOOGLE_CLIENT_ID", "").strip()
    if not value:
        raise failure(503, "Google sign-in is not configured yet. Use email and password.")
    return value


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def check_google_attempts(request: Request, path: Path, action: str) -> None:
    """Bound unauthenticated requests without recording IP addresses or tokens."""
    stamp = int(time.time())
    address = request.client.host if request.client else "unknown"
    scope = action + ":ip:" + digest(address)
    with database(path, write=True) as conn:
        conn.execute("DELETE FROM auth_attempts WHERE started_at<=?", (stamp - ATTEMPT_WINDOW,))
        row = conn.execute("SELECT attempts, started_at FROM auth_attempts WHERE scope=?", (scope,)).fetchone()
        if row and row["attempts"] >= 50:
            raise HTTPException(429, "Too many attempts. Please try again later.", headers={
                "Retry-After": str(max(1, row["started_at"] + ATTEMPT_WINDOW - stamp)),
                "Cache-Control": "no-store",
            })
        conn.execute(
            "INSERT INTO auth_attempts VALUES (?, 1, ?) "
            "ON CONFLICT(scope) DO UPDATE SET attempts=attempts+1", (scope, stamp),
        )


@router.post("/challenge", response_model=GoogleChallenge)
def challenge(
    body: EmptyInput, request: Request, response: Response, path: Path = Depends(get_savings_path),
) -> dict:
    audience = client_id()
    check_google_attempts(request, path, "google-challenge")
    existing = session_user(request, path)
    session_hash = digest(request.cookies[COOKIE]) if existing else None
    stamp = int(time.time())
    expires_at = stamp + CHALLENGE_SECONDS
    with database(path, write=True) as conn:
        conn.execute("DELETE FROM savings_google_challenges WHERE expires_at<=?", (stamp,))
        previous = request.cookies.get(NONCE_COOKIE)
        pending = conn.execute(
            "SELECT session_hash, expires_at FROM savings_google_challenges WHERE nonce_hash=?",
            (digest(previous),),
        ).fetchone() if previous and len(previous) <= 100 else None
        if pending and pending["session_hash"] == session_hash:
            # Tabs share the cookie; keep an already-open Google popup valid.
            nonce, expires_at = previous, pending["expires_at"]
        else:
            nonce = secrets.token_urlsafe(32)
        if previous and nonce != previous:
            conn.execute("DELETE FROM savings_google_challenges WHERE nonce_hash=?", (digest(previous),))
        conn.execute("INSERT OR IGNORE INTO savings_google_challenges VALUES (?, ?, ?)", (
            digest(nonce), session_hash, expires_at,
        ))
    response.set_cookie(
        NONCE_COOKIE, nonce, httponly=True, samesite="lax", max_age=max(1, expires_at - stamp),
        secure=request.url.scheme == "https" or os.environ.get("AJORA_COOKIE_SECURE") == "true",
    )
    response.headers["Cache-Control"] = "no-store"
    return {"client_id": audience, "nonce": nonce}


def challenge_session(conn, nonce: str, request: Request):
    challenge_row = conn.execute(
        "SELECT session_hash FROM savings_google_challenges WHERE nonce_hash=? AND expires_at>?",
        (digest(nonce), int(time.time())),
    ).fetchone()
    if challenge_row is None:
        raise failure(401, "Google sign-in expired. Please try again.")
    cookie = request.cookies.get(COOKIE)
    session_hash = digest(cookie) if cookie else None
    existing = conn.execute(
        "SELECT u.id AS user_id, u.display_name, c.email, g.sub FROM savings_sessions s "
        "JOIN savings_users u ON u.id=s.user_id LEFT JOIN savings_credentials c ON c.user_id=u.id "
        "LEFT JOIN savings_google_accounts g ON g.user_id=u.id "
        "WHERE s.token_hash=? AND s.expires_at>?", (session_hash, int(time.time())),
    ).fetchone()
    active_hash = session_hash if existing else None
    if challenge_row["session_hash"] != active_hash:
        raise failure(401, "Your session changed. Please start Google sign-in again.")
    return existing


@router.post("", response_model=Session)
def google_login(
    body: GoogleCredential, request: Request, response: Response, path: Path = Depends(get_savings_path),
) -> dict:
    audience = client_id()
    check_google_attempts(request, path, "google-login")
    nonce = request.cookies.get(NONCE_COOKIE, "")
    if not nonce or len(nonce) > 100:
        raise failure(401, "Start Google sign-in from this browser first.")
    with database(path) as conn:
        challenge_session(conn, nonce, request)
    try:
        # Google's verifier checks the signature, issuer, audience and expiry.
        claims = id_token.verify_oauth2_token(
            body.credential, partial(GoogleRequest(), timeout=5), audience,
        )
    except google_errors.TransportError:
        raise failure(503, "Google could not be reached. Please try again.") from None
    except (ValueError, TypeError, KeyError, google_errors.GoogleAuthError):
        raise failure(401, "Google sign-in could not be verified. Please try again.") from None
    if (claims.get("aud") != audience or claims.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}
            or not isinstance(claims.get("exp"), (int, float)) or claims["exp"] <= time.time()
            or not isinstance(claims.get("sub"), str) or not 1 <= len(claims["sub"]) <= 255
            or claims.get("email_verified") is not True
            or not isinstance(claims.get("nonce"), str) or not hmac.compare_digest(claims["nonce"].encode(), nonce.encode())):
        raise failure(401, "Google sign-in could not be verified. Please try again.")
    try:
        email = LoginInput.normalize_email(claims.get("email", ""))
    except (ValueError, AttributeError, TypeError):
        raise failure(401, "Google did not provide a valid verified email address.") from None
    sub = claims["sub"]
    name = claims.get("name")
    display_name = name.strip()[:80] if isinstance(name, str) else ""
    if len(display_name) < 2:
        display_name = "Ajora member"
    try:
        with database(path, write=True) as conn:
            # Recheck under the same lock that consumes the nonce and links the account.
            existing = challenge_session(conn, nonce, request)
            linked = conn.execute(
                "SELECT u.id AS user_id, u.display_name, c.email FROM savings_google_accounts g "
                "JOIN savings_users u ON u.id=g.user_id LEFT JOIN savings_credentials c ON c.user_id=u.id "
                "WHERE g.sub=?", (sub,),
            ).fetchone()
            if existing and (existing["sub"] not in {None, sub} or (linked and linked["user_id"] != existing["user_id"])):
                raise failure(409, "This Google account belongs to another profile. Sign out before switching accounts.")
            if existing and existing["sub"] is None and existing["email"] and existing["email"] != email:
                raise failure(409, "Choose the Google account matching your Ajora email address.")
            collision = conn.execute(
                "SELECT user_id FROM savings_credentials WHERE email=? UNION ALL "
                "SELECT user_id FROM savings_google_accounts WHERE email=?", (email, email),
            ).fetchall()
            user = linked or existing
            if any(row["user_id"] != (user["user_id"] if user else None) for row in collision):
                raise failure(409, "An account already uses this email. Sign in to that account, then link Google in Account access.")
            if user is None:
                user = {"user_id": secrets.token_hex(16), "display_name": display_name, "email": None}
                conn.execute("INSERT INTO savings_users VALUES (?, ?)", (user["user_id"], user["display_name"]))
            conn.execute("DELETE FROM savings_google_challenges WHERE nonce_hash=?", (digest(nonce),))
            if linked:
                conn.execute("UPDATE savings_google_accounts SET email=? WHERE sub=?", (email, sub))
            else:
                conn.execute("INSERT INTO savings_google_accounts VALUES (?, ?, ?)", (sub, user["user_id"], email))
            if existing:
                conn.execute("DELETE FROM savings_recovery_keys WHERE user_id=?", (user["user_id"],))
                conn.execute("DELETE FROM savings_sessions WHERE user_id=?", (user["user_id"],))
            token = issue_session(conn, user["user_id"])
            identity = {"user_id": user["user_id"], "display_name": user["display_name"],
                        "email": user["email"] or email, "google_linked": True}
    except sqlite3.IntegrityError:
        raise failure(409, "This Google account is already linked. Sign in again.") from None
    set_session_cookie(request, response, token)
    response.delete_cookie(NONCE_COOKIE, httponly=True, samesite="lax")
    return identity

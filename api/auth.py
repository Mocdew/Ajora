"""Email/password account access over the existing savings identity and sessions.

Email addresses are login identifiers, not verified contact or bank identities.
Passwords use salted, versioned PBKDF2 hashes; credentials never leave the API.
"""
from __future__ import annotations

import hashlib
import hmac
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .savings import (
    COOKIE, SESSION_SECONDS, Session, database, get_savings_path,
    require_identity_request, session_user,
)

class AuthErrorResponse(BaseModel):
    detail: str


router = APIRouter(
    prefix="/auth", tags=["auth"], dependencies=[Depends(require_identity_request)],
    responses={422: {"model": AuthErrorResponse}},
)
PASSWORD_ITERATIONS = 600_000
ATTEMPT_WINDOW = 15 * 60
EMAIL_PATTERN = re.compile(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\Z")


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=254, strict=True)
    password: str = Field(min_length=1, max_length=128, strict=True, repr=False)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        local, _, domain = email.partition("@")
        if (not EMAIL_PATTERN.fullmatch(email) or len(local) > 64
                or local.startswith(".") or local.endswith(".") or ".." in local
                or any(len(label) > 63 for label in domain.split("."))):
            raise ValueError("Enter a valid email address.")
        return email


class RegisterInput(LoginInput):
    display_name: str = Field(min_length=2, max_length=80, strict=True)
    password: str = Field(min_length=15, max_length=128, strict=True, repr=False)

    @field_validator("display_name", mode="before")
    @classmethod
    def trim_name(cls, value):
        return value.strip() if isinstance(value, str) else value


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    algorithm, iterations, salt, expected = encoded.split("$")
    if algorithm != "pbkdf2_sha256" or int(iterations) != PASSWORD_ITERATIONS:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
    return hmac.compare_digest(digest, bytes.fromhex(expected))


# Unknown accounts do the same password-hashing work as existing ones.
_DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


def email_scope(action: str, email: str) -> str:
    return action + ":email:" + hashlib.sha256(email.encode()).hexdigest()


def check_attempts(request: Request, email: str, path: Path, action: str) -> None:
    stamp = int(time.time())
    address = request.client.host if request.client else "unknown"
    scopes = [
        (action + ":ip:" + hashlib.sha256(address.encode()).hexdigest(), 100 if action == "login" else 50),
        (email_scope(action, email), 10),
    ]
    with database(path, write=True) as conn:
        conn.execute("DELETE FROM auth_attempts WHERE started_at<=?", (stamp - ATTEMPT_WINDOW,))
        for scope, limit in scopes:
            row = conn.execute("SELECT attempts, started_at FROM auth_attempts WHERE scope=?", (scope,)).fetchone()
            if row and row["attempts"] >= limit:
                raise HTTPException(429, "Too many attempts. Please try again later.", headers={
                    "Retry-After": str(max(1, row["started_at"] + ATTEMPT_WINDOW - stamp)),
                })
        for scope, _ in scopes:
            conn.execute(
                "INSERT INTO auth_attempts VALUES (?, 1, ?) "
                "ON CONFLICT(scope) DO UPDATE SET attempts=attempts+1", (scope, stamp),
            )


def issue_session(conn, user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    conn.execute("DELETE FROM savings_sessions WHERE expires_at<=?", (int(time.time()),))
    conn.execute("INSERT INTO savings_sessions VALUES (?, ?, ?)", (
        hashlib.sha256(token.encode()).hexdigest(), user_id, int(time.time()) + SESSION_SECONDS,
    ))
    return token


def set_session_cookie(request: Request, response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE, token, httponly=True, samesite="lax", max_age=SESSION_SECONDS,
        secure=request.url.scheme == "https" or os.environ.get("AJORA_COOKIE_SECURE") == "true",
    )
    response.headers["Cache-Control"] = "no-store"


@router.post("/register", response_model=Session, status_code=201)
def register(body: RegisterInput, request: Request, response: Response, path: Path = Depends(get_savings_path)) -> dict:
    existing = session_user(request, path)
    if existing and existing["email"]:
        raise HTTPException(409, "You are already signed in. Sign out before creating another account.")
    check_attempts(request, body.email, path, "register")
    encoded = hash_password(body.password)
    try:
        with database(path, write=True) as conn:
            if existing:
                # Recovery may revoke the guest session while hashing runs. Check
                # its authority again under the same lock that attaches credentials.
                active = conn.execute(
                    "SELECT 1 FROM savings_sessions WHERE token_hash=? AND user_id=? AND expires_at>?",
                    (hashlib.sha256(request.cookies[COOKIE].encode()).hexdigest(), existing["user_id"], int(time.time())),
                ).fetchone()
                if active is None:
                    raise HTTPException(401, "Your session changed. Restore your profile before registering.")
                if conn.execute("SELECT 1 FROM savings_credentials WHERE user_id=?", (existing["user_id"],)).fetchone():
                    raise HTTPException(409, "This profile already has an account. Sign in instead.")
            # Preserve the original identity/name referenced by existing circles.
            user = existing or {"user_id": secrets.token_hex(16), "display_name": body.display_name}
            if not existing:
                conn.execute("INSERT INTO savings_users VALUES (?, ?)", (user["user_id"], user["display_name"]))
            conn.execute("INSERT INTO savings_credentials VALUES (?, ?, ?)", (user["user_id"], body.email, encoded))
            conn.execute("DELETE FROM savings_recovery_keys WHERE user_id=?", (user["user_id"],))
            conn.execute("DELETE FROM savings_sessions WHERE user_id=?", (user["user_id"],))
            token = issue_session(conn, user["user_id"])
    except sqlite3.IntegrityError:
        raise HTTPException(409, "An account already uses these details. Sign in instead.") from None
    set_session_cookie(request, response, token)
    return {"user_id": user["user_id"], "display_name": user["display_name"], "email": body.email}


@router.post("/login", response_model=Session)
def login(body: LoginInput, request: Request, response: Response, path: Path = Depends(get_savings_path)) -> dict:
    if session_user(request, path):
        raise HTTPException(409, "You are already signed in. Sign out before using another account.")
    check_attempts(request, body.email, path, "login")
    with database(path) as conn:
        row = conn.execute(
            "SELECT u.id AS user_id, u.display_name, c.email, c.password_hash FROM savings_credentials c "
            "JOIN savings_users u ON u.id=c.user_id WHERE c.email=?", (body.email,),
        ).fetchone()
    valid = verify_password(body.password, row["password_hash"] if row else _DUMMY_PASSWORD_HASH)
    if row is None or not valid:
        raise HTTPException(401, "Email or password is incorrect.")
    with database(path, write=True) as conn:
        token = issue_session(conn, row["user_id"])
        conn.execute("DELETE FROM auth_attempts WHERE scope=?", (email_scope("login", body.email),))
    set_session_cookie(request, response, token)
    return {"user_id": row["user_id"], "display_name": row["display_name"], "email": row["email"]}

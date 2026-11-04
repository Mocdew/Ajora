"""Recoverable savings identities using private, high-entropy recovery keys.

Only a hash of the key is stored. Keys are shown when generated and remain valid
until replaced; recovering an identity revokes its previous browser sessions.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import Field

from .savings import (
    COOKIE, SESSION_SECONDS, EmptyInput, Input, Session, current_user, database,
    get_savings_path, require_identity_request,
)

router = APIRouter(prefix="/savings", tags=["savings"], dependencies=[Depends(require_identity_request)])


class RecoverInput(Input):
    recovery_key: str = Field(min_length=40, max_length=100)


class RecoveryKeyResponse(Input):
    recovery_key: str


def key_hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def ensure_recovery_table(conn) -> None:
    conn.execute("""CREATE TABLE IF NOT EXISTS savings_recovery_keys (
        user_id TEXT PRIMARY KEY, key_hash TEXT UNIQUE NOT NULL
    )""")


@router.post("/recovery-key", response_model=RecoveryKeyResponse)
def replace_recovery_key(
    body: EmptyInput, response: Response, user: dict = Depends(current_user),
    path: Path = Depends(get_savings_path),
) -> dict:
    if user.get("email"):
        raise HTTPException(403, "Use your email and password to access this account.")
    key = "ajora_" + secrets.token_urlsafe(32)
    with database(path, write=True) as conn:
        if conn.execute("SELECT 1 FROM savings_credentials WHERE user_id=?", (user["user_id"],)).fetchone():
            raise HTTPException(403, "Use your email and password to access this account.")
        ensure_recovery_table(conn)
        conn.execute(
            "INSERT INTO savings_recovery_keys (user_id, key_hash) VALUES (?, ?) "
            "ON CONFLICT(user_id) DO UPDATE SET key_hash=excluded.key_hash",
            (user["user_id"], key_hash(key)),
        )
    response.headers["Cache-Control"] = "no-store"
    return {"recovery_key": key}


@router.post("/recover", response_model=Session)
def recover_identity(
    body: RecoverInput, request: Request, response: Response,
    path: Path = Depends(get_savings_path),
) -> dict:
    token = secrets.token_urlsafe(32)
    with database(path, write=True) as conn:
        ensure_recovery_table(conn)
        row = conn.execute(
            "SELECT u.id AS user_id, u.display_name FROM savings_recovery_keys r "
            "JOIN savings_users u ON u.id=r.user_id "
            "WHERE r.key_hash=? AND NOT EXISTS (SELECT 1 FROM savings_credentials c WHERE c.user_id=u.id)",
            (key_hash(body.recovery_key),),
        ).fetchone()
        if row is None:
            raise HTTPException(401, "Recovery key is invalid.")
        user = dict(row)
        conn.execute("DELETE FROM savings_sessions WHERE user_id=?", (user["user_id"],))
        conn.execute("INSERT INTO savings_sessions VALUES (?, ?, ?)", (
            key_hash(token), user["user_id"], int(time.time()) + SESSION_SECONDS,
        ))
    response.set_cookie(
        COOKIE, token, httponly=True, samesite="lax", max_age=SESSION_SECONDS,
        secure=request.url.scheme == "https" or os.environ.get("AJORA_COOKIE_SECURE") == "true",
    )
    response.headers["Cache-Control"] = "no-store"
    return user


@router.post("/logout", status_code=204)
def logout(
    body: EmptyInput, request: Request, response: Response,
    user: dict = Depends(current_user), path: Path = Depends(get_savings_path),
) -> None:
    with database(path, write=True) as conn:
        conn.execute("DELETE FROM savings_sessions WHERE token_hash=?", (
            key_hash(request.cookies[COOKIE]),
        ))
    response.delete_cookie(COOKIE, httponly=True, samesite="lax")
    response.headers["Cache-Control"] = "no-store"

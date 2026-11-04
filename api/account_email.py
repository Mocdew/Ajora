"""Single-use email verification and password recovery for savings accounts."""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path
import secrets
import sqlite3
import time
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import account_mail
from .auth import AuthErrorResponse, LoginInput, check_attempts, email_scope, hash_password
from .savings import COOKIE, EmptyInput, current_user, database, get_savings_path, require_identity_request


router = APIRouter(prefix="/auth", tags=["auth"], responses={422: {"model": AuthErrorResponse}})
logger = logging.getLogger(__name__)
RESET_SECONDS = 30 * 60
VERIFY_SECONDS = 24 * 60 * 60
FORGOT_MESSAGE = "If an account uses this email, a password reset link will be sent. Check your inbox and spam folder."
INVALID_LINK = "This link is invalid or has expired. Please request a new one."
UNAVAILABLE = "Account emails are unavailable right now. Please try again later."
WRITE = [Depends(require_identity_request)]


class EmailInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=254, strict=True)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return LoginInput.normalize_email(value)


class EmailTokenInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=1, max_length=256, strict=True, repr=False)


class PasswordResetInput(EmailTokenInput):
    password: str = Field(min_length=15, max_length=128, strict=True, repr=False)


class AuthMessage(BaseModel):
    message: str


class EmailStatus(BaseModel):
    email: Optional[str]
    verified: bool
    delivery_available: bool


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def failure(status: int, detail: str) -> HTTPException:
    return HTTPException(status, detail, headers={"Cache-Control": "no-store"})


def require_delivery() -> None:
    if not account_mail.delivery_available():
        raise failure(503, UNAVAILABLE)


def limit(request: Request, key: str, path: Path, action: str) -> None:
    try:
        check_attempts(request, key, path, action)
    except HTTPException as exc:
        exc.headers = {**(exc.headers or {}), "Cache-Control": "no-store"}
        raise


def verified_email(conn, user_id: str, email: Optional[str]) -> bool:
    if not email:
        return False
    return bool(conn.execute(
        "SELECT 1 FROM savings_verified_emails WHERE user_id=? AND email=? UNION ALL "
        "SELECT 1 FROM savings_google_accounts WHERE user_id=? AND email=?",
        (user_id, email, user_id, email),
    ).fetchone())


def issue_token(conn, credential, purpose: Literal["reset", "verify"]) -> str:
    token = secrets.token_urlsafe(32)
    stamp = int(time.time())
    conn.execute("DELETE FROM savings_email_tokens WHERE expires_at<=?", (stamp,))
    conn.execute("DELETE FROM savings_email_tokens WHERE user_id=? AND purpose=?", (credential["user_id"], purpose))
    conn.execute("INSERT INTO savings_email_tokens VALUES (?, ?, ?, ?, ?, ?)", (
        digest(token), credential["user_id"], credential["email"], purpose, credential["password_hash"],
        stamp + (RESET_SECONDS if purpose == "reset" else VERIFY_SECONDS),
    ))
    return token


def remove_token(path: Path, token: str) -> None:
    with database(path, write=True) as conn:
        conn.execute("DELETE FROM savings_email_tokens WHERE token_hash=?", (digest(token),))


def prepare_reset(path: Path, email: str) -> None:
    # All addresses take this same post-response task. Account lookup, remote
    # writes, and provider latency must not reveal which addresses are registered.
    try:
        with database(path, write=True) as conn:
            credential = conn.execute(
                "SELECT user_id, email, password_hash FROM savings_credentials WHERE email=?", (email,),
            ).fetchone()
            if credential:
                token = issue_token(conn, credential, "reset")
        if credential:
            try:
                account_mail.send_account_email(email, "reset", token)
            except account_mail.MailDeliveryError:
                remove_token(path, token)
                logger.warning("Password reset email delivery failed.")
    except (sqlite3.Error, RuntimeError):
        # Never emit exception details, mailbox addresses, or secret token values.
        logger.warning("Password reset email preparation failed.")


def notify_password_changed(email: str) -> None:
    try:
        account_mail.send_password_changed_email(email)
    except account_mail.MailDeliveryError:
        # The reset is already committed. A notification outage must not make
        # the user repeat a consumed reset or restore the previous credential.
        logger.warning("Password change notification delivery failed.")


def token_credential(conn, token: str, purpose: str):
    row = conn.execute(
        "SELECT c.user_id, c.email, c.password_hash FROM savings_email_tokens t "
        "JOIN savings_credentials c ON c.user_id=t.user_id AND c.email=t.email "
        "AND c.password_hash=t.credential_hash "
        "WHERE t.token_hash=? AND t.purpose=? AND t.expires_at>?",
        (digest(token), purpose, int(time.time())),
    ).fetchone()
    if row is None:
        raise failure(400, INVALID_LINK)
    return row


def mark_verified(conn, user_id: str, email: str) -> None:
    conn.execute(
        "INSERT INTO savings_verified_emails VALUES (?, ?, ?) "
        "ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, verified_at=excluded.verified_at",
        (user_id, email, int(time.time())),
    )


@router.post("/password/forgot", status_code=202, response_model=AuthMessage, dependencies=WRITE)
def forgot_password(
    body: EmailInput, request: Request, response: Response, background_tasks: BackgroundTasks,
    path: Path = Depends(get_savings_path),
) -> dict:
    # Configuration failures must be independent of account existence.
    require_delivery()
    limit(request, body.email, path, "password-forgot")
    background_tasks.add_task(prepare_reset, path, body.email)
    response.headers["Cache-Control"] = "no-store"
    return {"message": FORGOT_MESSAGE}


@router.post("/password/reset", response_model=AuthMessage, dependencies=WRITE)
def reset_password(
    body: PasswordResetInput, request: Request, response: Response, background_tasks: BackgroundTasks,
    path: Path = Depends(get_savings_path),
) -> dict:
    limit(request, digest(body.token), path, "password-reset")
    # Invalid tokens do not trigger expensive password hashing.
    with database(path) as conn:
        token_credential(conn, body.token, "reset")
    encoded = hash_password(body.password)
    with database(path, write=True) as conn:
        credential = token_credential(conn, body.token, "reset")
        conn.execute("UPDATE savings_credentials SET password_hash=? WHERE user_id=?", (encoded, credential["user_id"]))
        conn.execute("DELETE FROM savings_sessions WHERE user_id=?", (credential["user_id"],))
        conn.execute("DELETE FROM savings_recovery_keys WHERE user_id=?", (credential["user_id"],))
        conn.execute("DELETE FROM savings_email_tokens WHERE user_id=?", (credential["user_id"],))
        conn.execute("DELETE FROM auth_attempts WHERE scope=?", (email_scope("login", credential["email"]),))
        mark_verified(conn, credential["user_id"], credential["email"])
    background_tasks.add_task(notify_password_changed, credential["email"])
    response.delete_cookie(COOKIE, httponly=True, samesite="lax")
    response.headers["Cache-Control"] = "no-store"
    return {"message": "Your password has been reset. Log in with your new password."}


@router.get("/email/status", response_model=EmailStatus)
def email_status(
    response: Response, user: dict = Depends(current_user), path: Path = Depends(get_savings_path),
) -> dict:
    with database(path) as conn:
        credential = conn.execute("SELECT email FROM savings_credentials WHERE user_id=?", (user["user_id"],)).fetchone()
        email = credential["email"] if credential else None
        verified = verified_email(conn, user["user_id"], email)
    response.headers["Cache-Control"] = "no-store"
    return {"email": email, "verified": verified, "delivery_available": account_mail.delivery_available()}


@router.post("/email/request", status_code=202, response_model=AuthMessage, dependencies=WRITE)
def request_verification(
    body: EmptyInput, request: Request, response: Response,
    user: dict = Depends(current_user), path: Path = Depends(get_savings_path),
) -> dict:
    require_delivery()
    limit(request, user["email"] or user["user_id"], path, "email-verification")
    with database(path, write=True) as conn:
        # A concurrent reset or sign-out must not let a revoked session send mail.
        active = conn.execute(
            "SELECT 1 FROM savings_sessions WHERE token_hash=? AND user_id=? AND expires_at>?",
            (digest(request.cookies[COOKIE]), user["user_id"], int(time.time())),
        ).fetchone()
        if active is None:
            raise failure(401, "Your session changed. Please log in again.")
        credential = conn.execute(
            "SELECT user_id, email, password_hash FROM savings_credentials WHERE user_id=?", (user["user_id"],),
        ).fetchone()
        if verified_email(conn, user["user_id"], user["email"]):
            response.headers["Cache-Control"] = "no-store"
            return {"message": "Your email address is already verified."}
        if credential is None:
            raise failure(409, "Add an email and password to your profile first.")
        token = issue_token(conn, credential, "verify")
    try:
        account_mail.send_account_email(credential["email"], "verify", token)
    except account_mail.MailDeliveryError:
        remove_token(path, token)
        raise failure(503, UNAVAILABLE) from None
    response.headers["Cache-Control"] = "no-store"
    return {"message": "A verification link has been sent. Check your inbox and spam folder."}


@router.post("/email/verify", response_model=AuthMessage, dependencies=WRITE)
def verify_email(
    body: EmailTokenInput, request: Request, response: Response,
    path: Path = Depends(get_savings_path),
) -> dict:
    limit(request, digest(body.token), path, "email-verify")
    with database(path, write=True) as conn:
        credential = token_credential(conn, body.token, "verify")
        mark_verified(conn, credential["user_id"], credential["email"])
        conn.execute("DELETE FROM savings_email_tokens WHERE user_id=? AND purpose='verify'", (credential["user_id"],))
    response.headers["Cache-Control"] = "no-store"
    return {"message": "Your email address is verified. You can return to your circles."}

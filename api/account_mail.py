"""Transactional account mail over HTTPS; secrets and links never enter logs."""
from __future__ import annotations

from email.utils import parseaddr
import hashlib
from html import escape
import json
import os
import re
import sys
from typing import Literal
from urllib.parse import urlencode, urlsplit

import httpx

RESEND_EMAIL_URL = "https://api.resend.com/emails"


class MailDeliveryError(RuntimeError):
    def __init__(self):
        super().__init__("Account email is temporarily unavailable. Please try again later.")


def _valid_mailbox(value: str) -> bool:
    return bool(re.fullmatch(r"[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+", value))


def _settings() -> tuple[str, str, str]:
    key = os.environ.get("AJORA_RESEND_API_KEY", "").strip()
    sender = os.environ.get("AJORA_EMAIL_FROM", "").strip()
    web_url = os.environ.get("AJORA_PUBLIC_WEB_URL", "").strip()
    try:
        parsed = urlsplit(web_url)
        address = parseaddr(sender)[1]
        valid_url = (
            parsed.scheme in {"http", "https"} and bool(parsed.hostname)
            and not parsed.username and not parsed.password
            and parsed.path in {"", "/"} and not parsed.query and not parsed.fragment
            and (parsed.scheme == "https" or parsed.hostname in {"localhost", "127.0.0.1", "::1"})
        )
        parsed.port  # Validate the port without trusting forwarded request headers.
    except ValueError:
        raise MailDeliveryError() from None
    if (not key or not sender or not valid_url or not _valid_mailbox(address)
            or any(ord(char) < 32 or ord(char) == 127 for char in key + sender + web_url)):
        raise MailDeliveryError()
    return key, sender, web_url.rstrip("/")


def delivery_available() -> bool:
    """Report configuration readiness, without making a network request."""
    try:
        _settings()
    except MailDeliveryError:
        return False
    return True


def _send(email: str, subject: str, text: str, html: str, *, key: str, sender: str, identity: str) -> None:
    if not _valid_mailbox(email) or any(ord(char) < 32 for char in email):
        raise MailDeliveryError()
    headers = {"Authorization": "Bearer " + key, "Idempotency-Key": identity}
    body = {"from": sender, "to": [email], "subject": subject, "text": text, "html": html}
    try:
        if sys.platform == "emscripten":
            message_id = _send_worker(headers, body)
        else:
            response = httpx.post(RESEND_EMAIL_URL, headers=headers, json=body, timeout=10, follow_redirects=False)
            message_id = response.json().get("id") if response.status_code == 200 else None
        if not isinstance(message_id, str):
            raise MailDeliveryError()
    except (httpx.HTTPError, ValueError, AttributeError):
        # Provider errors can contain recipient addresses, message bodies or credentials.
        raise MailDeliveryError() from None


def _send_worker(headers: dict, body: dict) -> str | None:
    from js import AbortSignal, Object, Request, fetch
    from pyodide.ffi import run_sync, to_js

    try:
        request = Request.new(RESEND_EMAIL_URL, to_js({
            "method": "POST",
            "headers": [[name, value] for name, value in {**headers, "Content-Type": "application/json"}.items()],
            "body": json.dumps(body),
            "redirect": "manual",
            "signal": AbortSignal.timeout(10_000),
        }, dict_converter=Object.fromEntries))
        response = run_sync(fetch(request))
        if response.status != 200:
            if response.body is not None:
                run_sync(response.body.cancel())
            return None
        return json.loads(run_sync(response.text())).get("id")
    except Exception:
        # Do not pass provider response or transport diagnostics to app logs.
        raise MailDeliveryError() from None


def send_account_email(email: str, purpose: Literal["reset", "verify"], token: str) -> None:
    key, sender, web_url = _settings()
    if purpose not in {"reset", "verify"} or not re.fullmatch(r"[A-Za-z0-9_-]{32,200}", token):
        raise MailDeliveryError()
    reset = purpose == "reset"
    action = "Reset your password" if reset else "Verify your email address"
    route = "/reset-password" if reset else "/verify-email"
    link = web_url + route + "#" + urlencode({"token": token})
    expiry = "30 minutes" if reset else "24 hours"
    explanation = (
        "After you reset your password, all devices will be signed out. Your circles and savings history stay with your account."
        if reset else "This confirms ownership of your email address. It does not verify your bank account or legal identity."
    )
    text = f"{action} for Ajora\n\n{link}\n\nThis link expires in {expiry} and works once.\n{explanation}\n\nIf you did not request this email, you can ignore it."
    html = (
        f"<h1>{action}</h1><p>Use the link below to continue with Ajora.</p>"
        f'<p><a href="{escape(link, quote=True)}">{action}</a></p>'
        f"<p>This link expires in {expiry} and works once.</p><p>{explanation}</p>"
        "<p>If you did not request this email, you can ignore it.</p>"
    )
    identity = "ajora-" + purpose + "-" + hashlib.sha256(token.encode()).hexdigest()
    _send(email, action + " · Ajora", text, html, key=key, sender=sender, identity=identity)


def send_password_changed_email(email: str) -> None:
    key, sender, web_url = _settings()
    subject = "Your Ajora password was changed"
    text = (
        "Your Ajora password was changed and all devices have been signed out.\n\n"
        "Your circles and savings history remain available after you log in again.\n\n"
        "If you did not make this change, request another password reset at " + web_url + "/forgot-password."
    )
    # A unique notice is needed for each successful password change.
    import secrets
    _send(email, subject, text, "<p>" + escape(text).replace("\n\n", "</p><p>") + "</p>",
          key=key, sender=sender, identity="ajora-password-changed-" + secrets.token_hex(16))

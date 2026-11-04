"""Opt-in demo login bootstrap for hosts with temporary SQLite state."""
from __future__ import annotations

import os
from pathlib import Path
import secrets

from pydantic import ValidationError

from .auth import RegisterInput, hash_password, verify_password
from .savings import database


def seed_demo_account(path: Path) -> None:
    email = os.environ.get("AJORA_DEMO_EMAIL")
    password = os.environ.get("AJORA_DEMO_PASSWORD")
    if email is None and password is None:
        return
    try:
        account = RegisterInput(display_name="Ajora Demo", email=email, password=password)
    except ValidationError:
        raise RuntimeError("Set valid AJORA_DEMO_EMAIL and AJORA_DEMO_PASSWORD together.") from None

    with database(path, write=True) as conn:
        existing = conn.execute(
            "SELECT user_id, password_hash FROM savings_credentials WHERE email=?", (account.email,),
        ).fetchone()
        google = conn.execute(
            "SELECT user_id FROM savings_google_accounts WHERE email=?", (account.email,),
        ).fetchone()
        if google and (not existing or google["user_id"] != existing["user_id"]):
            raise RuntimeError("Configured demo credentials conflict with an existing Google account.")
        if existing:
            if not verify_password(account.password, existing["password_hash"]):
                raise RuntimeError("Configured demo credentials conflict with an existing account.")
            return
        user_id = secrets.token_hex(16)
        conn.execute("INSERT INTO savings_users VALUES (?, ?)", (user_id, account.display_name))
        conn.execute("INSERT INTO savings_credentials VALUES (?, ?, ?)", (
            user_id, account.email, hash_password(account.password),
        ))

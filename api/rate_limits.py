"""Short-lived counters shared by savings identity and ledger endpoints."""
import hashlib
import time

from fastapi import HTTPException


ATTEMPT_WINDOW = 15 * 60


def rate_limit_scope(action: str, subject: str) -> str:
    return action + ":" + hashlib.sha256(subject.encode()).hexdigest()


def check_rate_limits(conn, scopes: list[tuple[str, int]]) -> None:
    """Check and charge all scopes within the caller's write transaction."""
    stamp = int(time.time())
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

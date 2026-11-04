"""Local browser-test entrypoint: real API and email templates, no external mail.

Run only with an isolated AJORA_STATE_DIR and AJORA_TEST_MAILBOX_PATH. Production
continues to use api.main:app; no test inbox endpoint is added to either app.
"""
import json as jsonlib
import os
from pathlib import Path
import threading

import httpx


state = Path(os.environ.get("AJORA_STATE_DIR", ""))
mailbox = Path(os.environ.get("AJORA_TEST_MAILBOX_PATH", ""))
if (not state.is_absolute() or not mailbox.is_absolute()
        or state.resolve() in {Path.cwd().resolve(), Path("/")}
        or os.environ.get("TURSO_DATABASE_URL") or os.environ.get("TURSO_AUTH_TOKEN")
        or os.environ.get("AJORA_REQUIRE_REMOTE_SAVINGS") == "true"):
    raise RuntimeError("The mail test API requires explicit isolated local state and a mailbox file.")

os.environ["AJORA_RESEND_API_KEY"] = "test-only-not-a-real-key"
os.environ["AJORA_EMAIL_FROM"] = "Ajora Test <accounts@example.invalid>"
os.environ["AJORA_PUBLIC_WEB_URL"] = os.environ.get("AJORA_TEST_BASE_URL", "http://127.0.0.1:3200")
os.environ["AJORA_COOKIE_SECURE"] = "false"
os.environ.pop("AJORA_DEMO_EMAIL", None)
os.environ.pop("AJORA_DEMO_PASSWORD", None)

from api import account_mail  # noqa: E402
from api.main import app  # noqa: E402,F401


_mailbox_lock = threading.Lock()


def capture_email(url, *, headers, json: dict, timeout, follow_redirects):
    if url != "https://api.resend.com/emails":
        raise RuntimeError("The mail test transport cannot make external requests.")
    with _mailbox_lock:
        descriptor = os.open(mailbox, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(descriptor, "w") as output:
            output.write(jsonlib.dumps(json) + "\n")
    return httpx.Response(200, json={"id": "local-test-message"})


account_mail.httpx.post = capture_email

"""SQLite-shaped access to Turso from a Cloudflare Python Worker."""
from __future__ import annotations

import base64
import hashlib
import json
import sqlite3
from urllib.parse import urlsplit

from .savings_storage import RemoteRow


_initialized_schemas: set[tuple[str, str]] = set()


def _post(url, token, payload):
    from js import AbortSignal, Object, Request, fetch
    from pyodide.ffi import run_sync, to_js

    request = Request.new(url, to_js({
        "method": "POST",
        "headers": [["Authorization", f"Bearer {token}"], ["Content-Type", "application/json"]],
        "body": json.dumps(payload),
        "redirect": "manual",
        "signal": AbortSignal.timeout(15_000),
    }, dict_converter=Object.fromEntries))
    response = run_sync(fetch(request))
    if response.status != 200:
        if response.body is not None:
            run_sync(response.body.cancel())
        raise sqlite3.OperationalError("Turso rejected the savings request.")
    return json.loads(run_sync(response.text()))


def _argument(value):
    if value is None:
        return {"type": "null"}
    if isinstance(value, int):
        return {"type": "integer", "value": str(int(value))}
    if isinstance(value, float):
        return {"type": "float", "value": value}
    if isinstance(value, str):
        return {"type": "text", "value": value}
    if isinstance(value, bytes):
        return {"type": "blob", "base64": base64.b64encode(value).decode("ascii")}
    raise TypeError("Unsupported savings SQL argument.")


def _value(field):
    kind = field["type"]
    if kind == "null":
        return None
    if kind == "blob":
        return base64.b64decode(field["base64"])
    if kind == "integer":
        return int(field["value"])
    if kind in {"text", "float"}:
        return field["value"]
    raise sqlite3.OperationalError("Unexpected Turso result value.")


class _Cursor:
    def __init__(self, result):
        columns = [column["name"] for column in result["cols"]]
        self._rows = iter(result["rows"])
        self._columns = columns

    def __iter__(self):
        for row in self._rows:
            if len(row) != len(self._columns):
                raise sqlite3.OperationalError("Unexpected Turso result row.")
            yield RemoteRow(zip(self._columns, map(_value, row)))

    def fetchone(self):
        return next(iter(self), None)

    def fetchall(self):
        return list(self)


class TursoHttpConnection:
    """Retain the Hrana stream baton for interactive, server-side transactions."""

    def __init__(self, url: str, token: str):
        database = urlsplit(url)
        self._origin = f"https://{database.netloc}"
        self._base_url = self._origin
        self._token = token
        self._baton = None
        self._transaction = False
        self._failed = False
        self._closed = False

    def _pipeline(self, *requests):
        if self._closed:
            raise sqlite3.ProgrammingError("Remote savings connection is closed.")
        try:
            reply = _post(f"{self._base_url}/v3/pipeline", self._token, {
                "baton": self._baton, "requests": requests,
            })
            baton = reply["baton"]
            if baton is not None and not isinstance(baton, str):
                raise ValueError("Invalid stream baton.")
            base_url = reply.get("base_url")
            if baton and base_url:
                destination = urlsplit(base_url)
                origin = urlsplit(self._origin)
                # Turso can pin a stream to a server. Scope the bearer token to
                # the original origin or another HTTPS endpoint run by Turso.
                if (destination.scheme != "https" or destination.username or destination.password
                        or destination.path not in {"", "/"} or destination.query or destination.fragment
                        or (destination.netloc != origin.netloc and not (
                            origin.hostname.endswith(".turso.io")
                            and (destination.hostname or "").endswith(".turso.io")
                            and destination.port in {None, 443}))):
                    raise ValueError("Invalid Turso stream URL.")
                self._base_url = base_url.rstrip("/")
            self._baton = baton
            results = reply["results"]
            if len(results) != len(requests):
                raise ValueError("Incomplete pipeline response.")
            if baton is None:
                self._base_url = self._origin
            return results
        except Exception:
            # A lost acknowledgement is ambiguous. Never replay it automatically or
            # open a replacement stream for subsequent writes in this transaction.
            self._failed = True
            raise sqlite3.OperationalError("Remote savings operation failed.") from None

    @staticmethod
    def _result(result, expected):
        response = result.get("response")
        if result.get("type") == "ok" and response and response.get("type") == expected:
            return response
        error = result.get("error") or {}
        if str(error.get("extended_code") or error.get("code") or "").startswith("SQLITE_CONSTRAINT"):
            raise sqlite3.IntegrityError("Savings constraint conflict.")
        raise sqlite3.OperationalError("Remote savings operation failed.")

    def executescript(self, schema: str):
        if self._closed or self._failed:
            raise sqlite3.OperationalError("Remote savings connection is unavailable.")
        identity = (self._origin, hashlib.sha256((self._token + "\0" + schema).encode()).hexdigest())
        if identity not in _initialized_schemas:
            result, _ = self._pipeline({"type": "sequence", "sql": schema}, {"type": "close"})
            self._result(result, "sequence")
            _initialized_schemas.add(identity)

    def execute(self, sql, parameters=()):
        if self._closed or self._failed:
            raise sqlite3.OperationalError("Remote savings connection is unavailable.")
        statement = {"type": "execute", "stmt": {"sql": sql, "args": [_argument(value) for value in parameters]}}
        interactive = self._transaction or sql.strip().upper() == "BEGIN IMMEDIATE"
        after = "get_autocommit" if interactive else "close"
        result, state = self._pipeline(statement, {"type": after})
        if interactive:
            try:
                self._failed = not self._baton or self._result(state, after)["is_autocommit"] is not False
            except (sqlite3.Error, KeyError, TypeError):
                self._failed = True
        value = self._result(result, "execute")["result"]
        if self._failed:
            raise sqlite3.OperationalError("Remote savings transaction ended before commit.")
        self._transaction = interactive
        return _Cursor(value)

    def commit(self):
        if self._closed or self._failed:
            raise sqlite3.OperationalError("Remote savings commit failed; success is not confirmed.")
        if self._transaction:
            try:
                result, _ = self._pipeline(
                    {"type": "execute", "stmt": {"sql": "COMMIT"}}, {"type": "close"},
                )
                self._result(result, "execute")
            except sqlite3.Error:
                self._failed = True
                raise sqlite3.OperationalError("Remote savings commit failed; success is not confirmed.") from None
            self._transaction = False

    def rollback(self):
        if self._baton:
            try:
                # Closing a Hrana stream rolls back any uncommitted transaction.
                self._pipeline({"type": "close"})
            except sqlite3.Error:
                # An unavailable or expired stream is rolled back at the server.
                pass
        self._baton = None
        self._transaction = False

    def close(self):
        self.rollback()
        self._closed = True

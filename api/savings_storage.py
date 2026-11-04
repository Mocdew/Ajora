"""SQLite connections: local files in development, authoritative Turso when configured."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import sqlite3
import threading
from urllib.parse import urlsplit


_schema_lock = threading.Lock()
_write_lock = threading.RLock()
_initialized_schemas: set[tuple[str, str]] = set()


class RemoteRow(dict):
    """Match sqlite3.Row's name/index access and dict(row) conversion."""
    def __getitem__(self, key):
        return tuple(self.values())[key] if isinstance(key, (int, slice)) else super().__getitem__(key)


class RemoteCursor:
    def __init__(self, cursor):
        self._cursor = cursor
        self._columns = [column[0] for column in cursor.description or ()]

    def _row(self, values):
        return None if values is None else RemoteRow(zip(self._columns, values))

    def fetchone(self):
        try:
            return self._row(self._cursor.fetchone())
        except Exception:
            raise sqlite3.OperationalError("Remote savings read failed.") from None

    def fetchall(self):
        try:
            return [self._row(row) for row in self._cursor.fetchall()]
        except Exception:
            raise sqlite3.OperationalError("Remote savings read failed.") from None

    def __iter__(self):
        return iter(self.fetchall())


class RemoteConnection:
    def __init__(self, connection, identity: str):
        self._connection = connection
        self._identity = identity
        self._write_locked = False

    def execute(self, sql, parameters=()):
        acquired = sql.strip().upper() == "BEGIN IMMEDIATE" and not self._write_locked
        if acquired:
            # The native driver's blocking calls hold the GIL. Do not let a
            # second local writer wait in native code while the first needs
            # Python execution to commit. SQLite still locks remote writers.
            _write_lock.acquire()
            self._write_locked = True
        try:
            return RemoteCursor(self._connection.execute(sql, parameters))
        except ValueError as error:
            if acquired:
                self._release_write()
            # The native driver exposes SQLite failures as ValueError, without
            # structured error codes. Keep the existing API's conflict handling.
            if any(marker in str(error) for marker in (
                "UNIQUE constraint failed", "PRIMARY KEY constraint failed",
                "NOT NULL constraint failed", "CHECK constraint failed",
                "FOREIGN KEY constraint failed",
            )):
                raise sqlite3.IntegrityError("Savings constraint conflict.") from None
            raise sqlite3.OperationalError("Remote savings operation failed.") from None
        except Exception:
            if acquired:
                self._release_write()
            raise sqlite3.OperationalError("Remote savings operation failed.") from None

    def _release_write(self):
        if self._write_locked:
            self._write_locked = False
            _write_lock.release()

    def executescript(self, schema: str):
        key = (self._identity, hashlib.sha256(schema.encode()).hexdigest())
        with _schema_lock:
            if key in _initialized_schemas:
                return
            # Connection.executescript in libsql 0.1.11 discards SQL failures.
            # Execute each complete static DDL statement explicitly instead.
            statement = ""
            for line in schema.splitlines(keepends=True):
                statement += line
                if sqlite3.complete_statement(statement):
                    self.execute(statement)
                    statement = ""
            if statement.strip():
                self.execute(statement)
            self.commit()
            _initialized_schemas.add(key)

    def commit(self):
        try:
            self._connection.commit()
        except Exception:
            raise sqlite3.OperationalError("Remote savings commit failed; success is not confirmed.") from None
        self._release_write()

    def rollback(self):
        try:
            self._connection.rollback()
        except Exception:
            # Preserve the original transaction/commit failure; closing the
            # connection still releases the server-side transaction.
            pass
        finally:
            self._release_write()

    def close(self):
        try:
            self._connection.close()
        except Exception:
            # Closing must not expose driver details or mask an earlier failed
            # commit. A successful write was already confirmed by commit().
            pass
        finally:
            self._release_write()


def _connect_remote(url: str, token: str):
    try:
        import libsql
    except ImportError:
        raise RuntimeError("Turso storage requires the libsql driver and a supported Python runtime.") from None
    try:
        return libsql.connect(database=url, auth_token=token, timeout=15, isolation_level=None)
    except Exception:
        raise sqlite3.OperationalError("Could not connect to remote savings storage.") from None


def connect_savings(path: Path):
    url = os.environ.get("TURSO_DATABASE_URL")
    token = os.environ.get("TURSO_AUTH_TOKEN")
    if os.environ.get("AJORA_REQUIRE_REMOTE_SAVINGS") == "true" and not (url and token):
        raise RuntimeError("Remote savings storage is required. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN together.")
    if url is None and token is None:
        path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(path, timeout=15)
        connection.row_factory = sqlite3.Row
        return connection
    try:
        parsed = urlsplit(url or "")
        valid = (bool(url and token and token.strip()) and parsed.scheme in {"libsql", "https"}
                 and bool(parsed.hostname) and not parsed.username and not parsed.password
                 and parsed.path in {"", "/"} and not parsed.query and not parsed.fragment)
    except ValueError:
        valid = False
    if not valid:
        raise RuntimeError("Set a valid TURSO_DATABASE_URL and TURSO_AUTH_TOKEN together.")
    connection = _connect_remote(url, token)
    identity = hashlib.sha256((url + "\0" + token).encode()).hexdigest()
    return RemoteConnection(connection, identity)

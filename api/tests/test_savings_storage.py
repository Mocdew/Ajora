"""Remote storage preserves SQLite semantics and never falls back on failure."""
import os
import sqlite3
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest

from api import savings_storage as storage


@pytest.fixture(autouse=True)
def clean_storage(monkeypatch):
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)
    storage._initialized_schemas.clear()


def remote(monkeypatch, path):
    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://test.turso.io")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "test-secret")
    monkeypatch.setattr(storage, "_connect_remote", lambda *_: sqlite3.connect(path, isolation_level=None))
    return storage.connect_savings(path.parent / "must-not-exist" / "local.sqlite3")


def test_remote_commit_reconnect_and_rollback_preserve_exact_money(monkeypatch, tmp_path):
    path = tmp_path / "remote.sqlite3"
    first = remote(monkeypatch, path)
    first.executescript("CREATE TABLE entries(id TEXT PRIMARY KEY, amount INTEGER);")
    first.execute("BEGIN IMMEDIATE")
    first.execute("INSERT INTO entries VALUES (?, ?)", ("paid", 100_000_000_000))
    first.commit()
    first.execute("BEGIN IMMEDIATE")
    first.execute("UPDATE entries SET amount=1")
    first.rollback()
    first.close()
    second = remote(monkeypatch, path)
    row = second.execute("SELECT id, amount FROM entries").fetchone()
    assert row[0] == row["id"] == "paid"
    assert row[1] == row["amount"] == 100_000_000_000
    assert dict(row) == {"id": "paid", "amount": 100_000_000_000}
    assert second.execute("SELECT * FROM entries WHERE id='missing'").fetchone() is None
    second.close()
    assert not (tmp_path / "must-not-exist").exists()


@pytest.mark.parametrize("url,token", [(None,"token"),("libsql://test.turso.io",None),("http://test.turso.io","secret"),("file:local.db","secret"),("https://user:secret@db.turso.io","secret")])
def test_bad_remote_config_never_creates_local_state(monkeypatch, tmp_path, url, token):
    if url is not None:
        monkeypatch.setenv("TURSO_DATABASE_URL", url)
    if token is not None:
        monkeypatch.setenv("TURSO_AUTH_TOKEN", token)
    with pytest.raises(RuntimeError) as error:
        storage.connect_savings(tmp_path / "new" / "state.db")
    assert "secret" not in str(error.value)
    assert not (tmp_path / "new").exists()


def test_network_failure_is_not_local_success(monkeypatch, tmp_path):
    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://test.turso.io")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "secret")
    def fail(*_):
        raise sqlite3.OperationalError("offline")
    monkeypatch.setattr(storage, "_connect_remote", fail)
    with pytest.raises(sqlite3.OperationalError):
        storage.connect_savings(tmp_path / "new" / "state.db")
    assert not (tmp_path / "new").exists()


def test_driver_constraint_and_commit_errors_are_safe():
    class Driver:
        def execute(self, *_):
            raise ValueError("UNIQUE constraint failed: private detail")
        def commit(self):
            raise ValueError("secret token must never leave driver")
    connection = storage.RemoteConnection(Driver(), "test")
    with pytest.raises(sqlite3.IntegrityError, match="constraint conflict"):
        connection.execute("INSERT")
    with pytest.raises(sqlite3.OperationalError) as error:
        connection.commit()
    assert "secret" not in str(error.value)


def test_schema_failure_is_not_cached():
    class Driver:
        def execute(self, *_):
            raise ValueError("secret connection details")
    connection = storage.RemoteConnection(Driver(), "test")
    with pytest.raises(sqlite3.OperationalError):
        connection.executescript("CREATE TABLE entries(id TEXT);")
    assert not storage._initialized_schemas


def test_native_driver_parallel_read_modify_writes(tmp_path):
    libsql = pytest.importorskip("libsql")
    path = str(tmp_path / "native.sqlite3")
    setup = libsql.connect(path, isolation_level=None)
    setup.execute("CREATE TABLE counter(n INTEGER)")
    setup.execute("INSERT INTO counter VALUES(0)")
    setup.close()

    def increment(_):
        conn = storage.RemoteConnection(libsql.connect(path, isolation_level=None, timeout=1), "native")
        try:
            conn.execute("BEGIN IMMEDIATE")
            current = conn.execute("SELECT n FROM counter").fetchone()[0]
            conn.execute("UPDATE counter SET n=?", (current + 1,))
            conn.commit()
        finally:
            conn.close()

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(increment, range(12)))
    check = libsql.connect(path, isolation_level=None)
    assert check.execute("SELECT n FROM counter").fetchone()[0] == 12
    check.close()


def test_real_remote_transaction_roundtrip(monkeypatch, tmp_path):
    url = os.environ.get("AJORA_TEST_TURSO_DATABASE_URL")
    token = os.environ.get("AJORA_TEST_TURSO_AUTH_TOKEN")
    if not url or not token:
        pytest.skip("A separate Turso test database is not configured.")
    monkeypatch.setenv("TURSO_DATABASE_URL", url)
    monkeypatch.setenv("TURSO_AUTH_TOKEN", token)
    key = uuid.uuid4().hex
    first = storage.connect_savings(tmp_path / "unused.db")
    second = storage.connect_savings(tmp_path / "unused.db")
    try:
        first.executescript("CREATE TABLE IF NOT EXISTS ajora_storage_probe(id TEXT PRIMARY KEY, amount INTEGER);")
        first.execute("BEGIN IMMEDIATE")
        first.execute("INSERT INTO ajora_storage_probe VALUES (?, ?)", (key, 100_000_000_000))
        first.commit()
        assert second.execute("SELECT amount FROM ajora_storage_probe WHERE id=?", (key,)).fetchone()[0] == 100_000_000_000
        first.execute("BEGIN IMMEDIATE")
        first.execute("UPDATE ajora_storage_probe SET amount=1 WHERE id=?", (key,))
        first.rollback()
        assert second.execute("SELECT amount FROM ajora_storage_probe WHERE id=?", (key,)).fetchone()[0] == 100_000_000_000
    finally:
        first.execute("DELETE FROM ajora_storage_probe WHERE id=?", (key,))
        first.commit()
        first.close()
        second.close()
    assert not (tmp_path / "unused.db").exists()

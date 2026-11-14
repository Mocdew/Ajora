import sqlite3

import pytest

from api import turso_http


def ready(request_type, **fields):
    return {"type": "ok", "response": {"type": request_type, **fields}}


def sql_result(columns=(), rows=()):
    return ready("execute", result={"cols": [{"name": name} for name in columns], "rows": rows})


def reply(baton, *results, base_url=None):
    return {"baton": baton, "base_url": base_url, "results": results}


def test_interactive_transaction_sticks_to_stream_and_preserves_integer(monkeypatch):
    open_transaction = ready("get_autocommit", is_autocommit=False)
    padded_number = 9_007_199_254_740_993
    responses = iter([
        reply("first", sql_result(), open_transaction, base_url="https://node.turso.io"),
        reply("second", sql_result(), open_transaction),
        reply("third", sql_result(("amount",), [[{"type": "integer", "value": str(padded_number)}]]), open_transaction),
        reply(None, sql_result(), ready("close")),
    ])
    requests = []

    def post(url, token, payload):
        requests.append((url, payload))
        return next(responses)

    monkeypatch.setattr(turso_http, "_post", post)
    connection = turso_http.TursoHttpConnection("libsql://example.turso.io", "test-token")
    connection.execute("BEGIN IMMEDIATE")
    connection.execute("INSERT INTO savings VALUES (?)", (padded_number,))
    row = connection.execute("SELECT amount FROM savings").fetchone()
    assert row[0] == row["amount"] == padded_number
    connection.commit()
    connection.close()

    assert [payload["baton"] for _, payload in requests] == [None, "first", "second", "third"]
    assert [url for url, _ in requests] == [
        "https://example.turso.io/v3/pipeline", *(["https://node.turso.io/v3/pipeline"] * 3),
    ]
    assert requests[1][1]["requests"][0]["stmt"]["args"] == [{"type": "integer", "value": str(padded_number)}]
    assert requests[-1][1]["requests"][-1] == {"type": "close"}


def test_aborted_remote_transaction_never_resumes_in_autocommit(monkeypatch):
    responses = iter([
        reply("first", sql_result(), ready("get_autocommit", is_autocommit=False)),
        reply(None, sql_result(), ready("get_autocommit", is_autocommit=True)),
    ])
    monkeypatch.setattr(turso_http, "_post", lambda *_: next(responses))
    connection = turso_http.TursoHttpConnection("https://example.turso.io", "test-token")
    connection.execute("BEGIN IMMEDIATE")
    with pytest.raises(sqlite3.OperationalError, match="ended before commit"):
        connection.execute("UPDATE savings SET amount=100")
    with pytest.raises(sqlite3.OperationalError, match="connection is unavailable"):
        connection.execute("UPDATE savings SET amount=200")
    with pytest.raises(sqlite3.OperationalError, match="success is not confirmed"):
        connection.commit()


def test_lost_commit_acknowledgement_is_never_replayed(monkeypatch):
    requests = []

    def post(url, token, payload):
        requests.append(payload)
        operation = payload["requests"][0]
        if operation["type"] == "close":
            return reply(None, ready("close"))
        if operation["stmt"]["sql"] == "COMMIT":
            raise OSError("credential must not appear in the error")
        return reply("first", sql_result(), ready("get_autocommit", is_autocommit=False))

    monkeypatch.setattr(turso_http, "_post", post)
    connection = turso_http.TursoHttpConnection("https://example.turso.io", "test-token")
    connection.execute("BEGIN IMMEDIATE")
    with pytest.raises(sqlite3.OperationalError, match="success is not confirmed") as error:
        connection.commit()
    assert "credential" not in str(error.value)
    connection.rollback()
    connection.close()
    assert len(requests) == 3
    assert requests[-1] == {"baton": "first", "requests": ({"type": "close"},)}


def test_stream_base_url_cannot_redirect_credentials_outside_turso(monkeypatch):
    paths = []

    def post(url, token, payload):
        paths.append(url)
        return reply("first", sql_result(), ready("get_autocommit", is_autocommit=False), base_url="https://evil.turso.io.example")

    monkeypatch.setattr(turso_http, "_post", post)
    connection = turso_http.TursoHttpConnection("https://example.turso.io", "test-token")
    with pytest.raises(sqlite3.OperationalError):
        connection.execute("BEGIN IMMEDIATE")
    connection.close()
    assert paths == ["https://example.turso.io/v3/pipeline"]

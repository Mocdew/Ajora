"""Append-only confirm/reject feedback for transfer matches."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from api.corrections import FileCorrectionsLog
from api.deps import get_corrections_log
from api.main import app

client = TestClient(app)
USER = "u_persona_c"


def _first_match() -> dict:
    response = client.get(f"/users/{USER}/cashflow")
    assert response.status_code == 200
    return response.json()["matches"][0]


def test_confirm_appends_correction_and_audit_entry(tmp_trust_state) -> None:
    match = _first_match()
    response = client.post(
        f"/users/{USER}/corrections",
        json={"match_id": match["match_id"], "verdict": "confirm"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == USER
    assert body["match_id"] == match["match_id"]
    assert body["verdict"] == "confirm"
    assert body["debit_transaction_id"] == match["debit"]["id"]
    assert body["credit_transaction_id"] == match["credit"]["id"]
    assert body["previous_score"] == match["score"]
    assert body["previous_tier"] == match["tier"]

    lines = tmp_trust_state["corrections_path"].read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0])["verdict"] == "confirm"

    audit = client.get(f"/users/{USER}/audit").json()["entries"]
    assert [entry["endpoint"] for entry in audit] == ["cashflow", "correction_confirm"]


def test_reject_is_append_only_and_survives_reload(tmp_trust_state) -> None:
    match = _first_match()
    path = tmp_trust_state["corrections_path"]
    for verdict in ("confirm", "reject"):
        assert client.post(
            f"/users/{USER}/corrections",
            json={"match_id": match["match_id"], "verdict": verdict},
        ).status_code == 200

    lines = path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    reloaded = FileCorrectionsLog(path)
    assert [entry.verdict for entry in reloaded.entries_for(USER)] == ["confirm", "reject"]


def test_correction_rejects_unknown_match_and_invalid_verdict(tmp_trust_state) -> None:
    unknown = client.post(
        f"/users/{USER}/corrections",
        json={"match_id": "not-a-match", "verdict": "reject"},
    )
    invalid = client.post(
        f"/users/{USER}/corrections",
        json={"match_id": "not-a-match", "verdict": "maybe"},
    )
    assert unknown.status_code == 404
    assert invalid.status_code == 422
    assert not tmp_trust_state["corrections_path"].exists()
    assert tmp_trust_state["audit_log"].entries_for(USER) == []


def test_failed_correction_write_does_not_claim_success_in_audit(tmp_trust_state) -> None:
    class FailingCorrectionsLog:
        def record(self, **kwargs):
            raise OSError("disk full")

        def entries_for(self, user_id, limit=200):
            return []

    match = _first_match()
    app.dependency_overrides[get_corrections_log] = lambda: FailingCorrectionsLog()
    failing_client = TestClient(app, raise_server_exceptions=False)

    response = failing_client.post(
        f"/users/{USER}/corrections",
        json={"match_id": match["match_id"], "verdict": "confirm"},
    )

    assert response.status_code == 500
    assert [
        entry.endpoint for entry in tmp_trust_state["audit_log"].entries_for(USER)
    ] == ["cashflow"]


def test_correction_unknown_user_is_404() -> None:
    response = client.post(
        "/users/ghost/corrections",
        json={"match_id": "no-match", "verdict": "confirm"},
    )
    assert response.status_code == 404

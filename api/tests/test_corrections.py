"""Append-only confirm/reject feedback for transfer matches."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from api.corrections import FileCorrectionsLog
from api.deps import get_corrections_log, get_provider
from api.main import app
from engine.schemas.transaction import Transaction, TransactionBatch, UserProfile

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
    initial = client.get(f"/users/{USER}/cashflow").json()
    match = initial["matches"][0]
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
    app.dependency_overrides[get_corrections_log] = lambda: reloaded
    updated = client.get(f"/users/{USER}/cashflow").json()
    assert updated["matches"][0]["verdict"] == "reject"
    assert updated["before_after"]["matched_transfer_count"] == initial["before_after"]["matched_transfer_count"] - 1
    assert updated["totals"]["net_income"] == initial["totals"]["net_income"] + match["credit_amount_ngn"]


def _test_provider(monkeypatch, credit_currency="NGN"):
    user = UserProfile(user_id="u_test", full_name="Emeka Balogun", account_ids=["a", "b"])
    transactions = [
        Transaction(
            id=account, account_id=account, institution=account, direction=direction,
            amount=50_000, currency=currency, narration="rent", timestamp="2026-08-03T10:00:00Z",
        )
        for account, direction, currency in [("a", "debit", "NGN"), ("b", "credit", credit_currency)]
    ]

    class Provider:
        def get_batch(self, user_id):
            assert user_id == user.user_id
            return TransactionBatch(user=user, transactions=transactions)

    monkeypatch.setitem(app.dependency_overrides, get_provider, Provider)
    return f"/users/{user.user_id}"


def test_confirm_medium_match_recomputes_cashflow_insights_and_explanation(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    url = _test_provider(monkeypatch)
    pending = client.get(f"{url}/cashflow").json()
    match, = pending["matches"]
    assert match["tier"] == "medium" and match["verdict"] is None
    assert pending["internal_transfer_ids"] == []
    assert pending["before_after"]["matched_transfer_count"] == 0
    assert pending["totals"]["net_income"] == pending["totals"]["net_spending"] == 50_000
    assert client.get(f"{url}/explanations").json()["explanations"]["dedup"]["facts"]["match_count"] == 0
    assert client.post(f"{url}/corrections", json={"match_id": match["match_id"], "verdict": "confirm"}).is_success
    confirmed = client.get(f"{url}/cashflow").json()
    assert confirmed["matches"][0]["verdict"] == "confirm"
    assert confirmed["internal_transfer_ids"] == ["a", "b"]
    assert confirmed["before_after"]["matched_transfer_count"] == 1
    assert confirmed["totals"]["net_income"] == confirmed["totals"]["net_spending"] == 0
    assert client.get(f"{url}/insights").json()["insights"]["net_income_ngn"] == 0
    assert client.get(f"{url}/explanations").json()["explanations"]["dedup"]["facts"]["match_count"] == 1


def test_missing_fx_rate_returns_an_actionable_response(monkeypatch):
    url = _test_provider(monkeypatch, credit_currency="CAD")
    response = client.get(f"{url}/cashflow")
    assert response.status_code == 422
    assert "No NGN exchange rate configured for CAD" in response.json()["detail"]


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

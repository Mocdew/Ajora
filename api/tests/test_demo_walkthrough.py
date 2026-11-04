"""Rehearse the demo with the real HTTP routes and isolated append-only state."""

import pytest
from fastapi.testclient import TestClient

from api import explanations
from api.main import app
from engine.explainer.client import ExplainerUnavailable

client = TestClient(app)


def _view(user, expected_types):
    base = f"/users/{user}"
    cash = client.get(f"{base}/cashflow").json()["before_after"]
    insights = client.get(f"{base}/insights").json()["insights"]["insights"]
    graph = client.get(f"{base}/graph").json()
    response = client.get(f"{base}/explanations").json()
    narrated = response["explanations"]
    assert {item["relationship_type"] for item in insights} == set(expected_types)
    assert {node["id"] for node in graph["nodes"] if node["kind"] == "counterparty"} == {
        item["counterparty"] for item in insights
    }
    assert set(narrated) == {"dedup"} | {
        f"{item['relationship_type']}:{item['counterparty']}" for item in insights
    }
    assert response["generatedBy"] == "stub-offline"
    assert all(item["narration"] and item["grounded"] for item in narrated.values())
    assert narrated["dedup"]["facts"]["match_count"] == cash["matched_transfer_count"]
    assert narrated["dedup"]["facts"]["totals"]["net_income"] == cash["income_after_ngn"]
    return cash, insights, narrated


@pytest.mark.parametrize(
    "user,account,before_types,revoked_types",
    [
        ("u_demo_stephen", "gtb-001", [], []),
        ("u_persona_a", "gtb-a01", [], []),
        ("u_persona_b", "domv-b04", ["dependent", "remittance"], ["dependent"]),
        ("u_persona_c", "opay-c02", ["dependent", "informal_lending", "ajo_esusu"], ["ajo_esusu"]),
    ],
)
def test_persona_revoke_and_restore(user, account, before_types, revoked_types):
    base = f"/users/{user}"
    before = _view(user, before_types)
    if user == "u_persona_b":
        assert "The largest move, ₦300,000" in before[2]["dedup"]["narration"]
        assert "remittance:CHIOMA BALOGUN" in before[2]  # a different person with the same surname
    assert client.post(f"{base}/accounts/{account}/revoke").json()["status"] == "revoked"
    after = _view(user, revoked_types)
    assert after[0]["income_after_ngn"] != before[0]["income_after_ngn"]
    access = client.get(f"{base}/audit").json()["entries"][-4:]
    assert [entry["endpoint"] for entry in access] == ["cashflow", "insights", "graph", "explanations"]
    assert all(
        account in entry["revoked_excluded"] and account not in entry["accounts_accessed"]
        for entry in access
    )
    assert client.post(f"{base}/accounts/{account}/grant").json()["status"] == "granted"
    assert _view(user, before_types) == before


@pytest.mark.parametrize("service_down", [True, False], ids=["unavailable", "ungrounded"])
def test_unusable_live_narration_falls_back_for_whole_response(monkeypatch, service_down):
    class FailedLiveClient:
        def explain(self, system, user):
            if service_down:
                raise ExplainerUnavailable("Service unavailable")
            return "Income was ₦42,424,242."

    url = "/users/u_persona_b/explanations"
    offline = client.get(url).json()
    monkeypatch.setattr(explanations, "_make_client", FailedLiveClient)
    assert client.get(url).json() == offline

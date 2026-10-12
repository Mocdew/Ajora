"""API-layer tests: the four endpoints return correct, typed data end to end.

Exercised against the real labelled persona `u_persona_a` through the real engine
pipeline (no mocks) — so a green suite means load -> dedup -> insights -> graph all
wire together and the OpenAPI schema generates.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from api.deps import get_provider
from api.main import app
from api.service import USER_NODE_ID

client = TestClient(app)

# u_persona_c carries the richest communal mix (ajo/esusu + dependent + informal
# lending), so it exercises the insights + graph endpoints meaningfully. The
# all-personas test below confirms a/b/c every endpoint regardless of content.
PERSONA = "u_persona_c"
VALID_RELATIONSHIP_TYPES = {"ajo_esusu", "dependent", "informal_lending", "remittance"}


def test_health_lists_personas() -> None:
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert PERSONA in body["users"]


def test_transactions_endpoint() -> None:
    r = client.get(f"/users/{PERSONA}/transactions")
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == PERSONA
    assert body["count"] == len(body["transactions"]) > 0
    # Eval-only ground-truth fields must never leak through the API.
    assert all("transfer_pair_id" not in t for t in body["transactions"])
    assert all("communal_tag" not in t for t in body["transactions"])


def test_cashflow_shows_dedup_removing_phantom_transfers() -> None:
    r = client.get(f"/users/{PERSONA}/cashflow")
    assert r.status_code == 200
    body = r.json()
    ba = body["before_after"]
    # Dedup actually removed self-transfers, so the naive numbers are inflated.
    assert ba["income_before_ngn"] > ba["income_after_ngn"]
    assert ba["spending_before_ngn"] > ba["spending_after_ngn"]
    assert ba["income_inflation_pct"] > 0
    assert ba["matched_transfer_count"] >= 1
    assert len(body["matches"]) == ba["matched_transfer_count"]
    # Removing both legs of each matched pair shrinks the ledger by exactly 2x matches.
    raw_count = client.get(f"/users/{PERSONA}/transactions").json()["count"]
    assert body["deduped_transaction_count"] == raw_count - 2 * ba["matched_transfer_count"]
    # Totals are internally consistent with the before/after view.
    assert body["totals"]["net_income"] == ba["income_after_ngn"]
    assert body["totals"]["gross_income"] == ba["income_before_ngn"]


def test_insights_endpoint() -> None:
    r = client.get(f"/users/{PERSONA}/insights")
    assert r.status_code == 200
    body = r.json()
    insights = body["insights"]["insights"]
    assert len(insights) >= 1
    for ins in insights:
        assert ins["relationship_type"] in VALID_RELATIONSHIP_TYPES
        assert ins["count"] >= 1


def test_graph_endpoint_has_user_and_counterparties() -> None:
    r = client.get(f"/users/{PERSONA}/graph")
    assert r.status_code == 200
    body = r.json()
    node_ids = {n["id"] for n in body["nodes"]}
    assert USER_NODE_ID in node_ids
    counterparties = [n for n in body["nodes"] if n["kind"] == "counterparty"]
    assert len(counterparties) >= 1
    assert len(body["edges"]) >= 1
    # Every edge connects two declared nodes and is typed.
    for e in body["edges"]:
        assert e["source"] in node_ids and e["target"] in node_ids
        assert e["relationship_type"] in VALID_RELATIONSHIP_TYPES


def test_unknown_user_is_404() -> None:
    for path in ("transactions", "cashflow", "insights", "graph"):
        r = client.get(f"/users/does_not_exist/{path}")
        assert r.status_code == 404


def test_openapi_schema_generates() -> None:
    schema = app.openapi()
    assert schema["info"]["title"] == "Ajora API"
    paths = schema["paths"]
    for p in (
        "/users/{user_id}/transactions",
        "/users/{user_id}/cashflow",
        "/users/{user_id}/insights",
        "/users/{user_id}/graph",
    ):
        assert p in paths


def test_users_roster() -> None:
    r = client.get("/users")
    assert r.status_code == 200
    roster = r.json()
    ids = {u["id"] for u in roster}
    assert {"u_persona_a", "u_persona_b", "u_persona_c"} <= ids
    for u in roster:
        assert u["accounts"] >= 1 and u["transactions"] >= 1


def test_explanations_endpoint_is_grounded() -> None:
    r = client.get(f"/users/{PERSONA}/explanations")
    assert r.status_code == 200
    body = r.json()
    assert body["userId"] == PERSONA
    # Shape matches the frontend's ExplanationsResponse (camelCase, dedup key present).
    dedup = body["explanations"]["dedup"]
    assert dedup["insightKey"] == "dedup"
    assert dedup["narration"].strip()
    assert dedup["grounded"] is True
    # No API key in tests -> offline stub produced the (grounded) narration.
    assert "stub" in body["generatedBy"]


def test_explanations_include_grounded_communal_narration() -> None:
    # u_persona_c has ajo/dependent/lending relationships, so /explanations should carry
    # one grounded entry per relationship alongside the dedup one.
    r = client.get(f"/users/{PERSONA}/explanations")
    assert r.status_code == 200
    ex = r.json()["explanations"]
    assert "dedup" in ex
    communal_keys = [k for k in ex if k != "dedup"]
    assert communal_keys, "persona_c should have communal relationships narrated"
    # Every explanation (dedup + communal) is grounded and non-empty...
    assert all(ex[k]["grounded"] is True for k in ex)
    assert all(ex[k]["narration"].strip() for k in ex)
    # ...and communal keys are "<relationship_type>:<counterparty>".
    for k in communal_keys:
        assert k.split(":", 1)[0] in VALID_RELATIONSHIP_TYPES


def test_explanations_unknown_user_is_404() -> None:
    assert client.get("/users/nope/explanations").status_code == 404


def test_every_persona_serves_all_endpoints() -> None:
    for user_id in get_provider().list_users():
        for path in ("transactions", "cashflow", "insights", "graph", "explanations"):
            assert client.get(f"/users/{user_id}/{path}").status_code == 200

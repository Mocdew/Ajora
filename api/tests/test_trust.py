"""Trust-layer tests: per-account consent + append-only audit.

Exercised against the real persona `u_persona_c` through the real engine, so the
before/after numbers below are the engine's actual output. Revoking an account must
visibly change `/transactions`, `/cashflow` and `/insights`; every data access must
write exactly one immutable audit entry. The `tmp_trust_state` autouse fixture
(conftest) keeps all state in a per-test tmp dir — the real repo files are never
touched.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)

USER = "u_persona_c"  # gtb-c01 / opay-c02 / palmpay-c03
DATA_ENDPOINTS = ["transactions", "cashflow", "insights", "graph", "explanations"]


# --- default consent state ---------------------------------------------------------


def test_default_state_all_accounts_granted() -> None:
    body = client.get(f"/users/{USER}/consents").json()
    assert body["user_id"] == USER
    consents = {c["account_id"]: c for c in body["consents"]}
    assert set(consents) == {"gtb-c01", "opay-c02", "palmpay-c03"}
    for rec in consents.values():
        assert rec["status"] == "granted"
        assert rec["revoked_at"] is None
        assert rec["granted_at"] is not None
    # Institution is captured from the transactions during seeding.
    assert consents["palmpay-c03"]["institution"] == "palmpay"
    assert consents["gtb-c01"]["institution"] == "gtbank"


# --- revocation filters the pipeline -----------------------------------------------


def test_revoke_removes_account_from_transactions_and_cashflow() -> None:
    # Before: full ledger, two self-transfer pairs matched.
    assert client.get(f"/users/{USER}/transactions").json()["count"] == 83
    before_cf = client.get(f"/users/{USER}/cashflow").json()
    assert before_cf["before_after"]["matched_transfer_count"] == 2
    assert before_cf["totals"]["net_spending"] == 781800.0

    # Revoke palmpay-c03 (the credit leg of one self-transfer pair).
    r = client.post(f"/users/{USER}/accounts/palmpay-c03/revoke")
    assert r.status_code == 200
    rec = r.json()
    assert rec["status"] == "revoked"
    assert rec["revoked_at"] is not None

    # /consents reflects the revocation.
    consents = {c["account_id"]: c for c in client.get(f"/users/{USER}/consents").json()["consents"]}
    assert consents["palmpay-c03"]["status"] == "revoked"
    assert consents["palmpay-c03"]["revoked_at"] is not None

    # /transactions: palmpay transactions are gone, count drops 83 -> 62.
    tx = client.get(f"/users/{USER}/transactions").json()
    assert tx["count"] == 62
    assert all(t["account_id"] != "palmpay-c03" for t in tx["transactions"])

    # /cashflow visibly changes: the palmpay leg can no longer match, so the pair
    # count drops 2 -> 1 and net spending falls.
    cf = client.get(f"/users/{USER}/cashflow").json()
    assert cf["before_after"]["matched_transfer_count"] == 1
    assert cf["totals"]["net_spending"] == 619600.0
    assert cf["totals"]["net_spending"] < before_cf["totals"]["net_spending"]


def test_revoke_drops_a_communal_insight() -> None:
    # opay-c02 carries the dependent + informal-lending relationships.
    before = client.get(f"/users/{USER}/insights").json()["insights"]["insights"]
    assert len(before) == 3
    assert client.post(f"/users/{USER}/accounts/opay-c02/revoke").status_code == 200

    after = client.get(f"/users/{USER}/insights").json()["insights"]["insights"]
    assert len(after) == 1
    assert {i["relationship_type"] for i in after} == {"ajo_esusu"}

    # Net income is recomputed on the consented ledger.
    cf = client.get(f"/users/{USER}/cashflow").json()
    assert cf["totals"]["net_income"] == 863980.0
    assert cf["before_after"]["matched_transfer_count"] == 0


def test_regrant_restores_the_account() -> None:
    client.post(f"/users/{USER}/accounts/palmpay-c03/revoke")
    assert client.get(f"/users/{USER}/transactions").json()["count"] == 62

    r = client.post(f"/users/{USER}/accounts/palmpay-c03/grant")
    assert r.status_code == 200
    rec = r.json()
    assert rec["status"] == "granted"
    assert rec["revoked_at"] is None

    # Fully restored.
    assert client.get(f"/users/{USER}/transactions").json()["count"] == 83
    cf = client.get(f"/users/{USER}/cashflow").json()
    assert cf["before_after"]["matched_transfer_count"] == 2
    assert cf["totals"]["net_spending"] == 781800.0


# --- append-only audit log ---------------------------------------------------------


def test_each_data_access_writes_exactly_one_audit_entry() -> None:
    for i, ep in enumerate(DATA_ENDPOINTS, start=1):
        assert client.get(f"/users/{USER}/{ep}").status_code == 200
        entries = client.get(f"/users/{USER}/audit").json()["entries"]
        # Reading /audit does not itself write an entry; each data call adds one.
        assert len(entries) == i
    entries = client.get(f"/users/{USER}/audit").json()["entries"]
    assert [e["endpoint"] for e in entries] == DATA_ENDPOINTS
    for e in entries:
        assert e["user_id"] == USER
        assert e["timestamp"]


def test_audit_entry_records_accessed_and_excluded_accounts() -> None:
    client.post(f"/users/{USER}/accounts/palmpay-c03/revoke")
    client.get(f"/users/{USER}/cashflow")
    last = client.get(f"/users/{USER}/audit").json()["entries"][-1]
    assert last["endpoint"] == "cashflow"
    assert set(last["accounts_accessed"]) == {"gtb-c01", "opay-c02"}
    assert last["revoked_excluded"] == ["palmpay-c03"]


def test_audit_log_is_append_only(tmp_trust_state) -> None:
    path = tmp_trust_state["audit_path"]
    client.get(f"/users/{USER}/cashflow")
    lines_before = path.read_text(encoding="utf-8").splitlines()
    assert len(lines_before) == 1

    client.get(f"/users/{USER}/insights")
    lines_after = path.read_text(encoding="utf-8").splitlines()
    # Count grew by exactly one and every prior line is byte-for-byte unchanged.
    assert len(lines_after) == len(lines_before) + 1
    assert lines_after[: len(lines_before)] == lines_before


# --- consent events are durable & folded -------------------------------------------


def test_consent_state_survives_reload_from_file(tmp_trust_state) -> None:
    from api.consent import FileConsentStore

    client.post(f"/users/{USER}/accounts/palmpay-c03/revoke")
    # A fresh store reading the same events file folds to the same current state.
    reloaded = FileConsentStore(tmp_trust_state["consent_path"])
    assert reloaded.revoked_accounts(USER) == {"palmpay-c03"}
    records = {r.account_id: r for r in reloaded.records_for(USER)}
    assert records["palmpay-c03"].status == "revoked"
    assert records["gtb-c01"].status == "granted"


# --- 404s --------------------------------------------------------------------------


def test_revoke_unknown_account_is_404() -> None:
    assert client.post(f"/users/{USER}/accounts/not-an-account/revoke").status_code == 404
    assert client.post(f"/users/{USER}/accounts/not-an-account/grant").status_code == 404


def test_trust_endpoints_unknown_user_is_404() -> None:
    assert client.get("/users/ghost/consents").status_code == 404
    assert client.get("/users/ghost/audit").status_code == 404
    assert client.post("/users/ghost/accounts/x/revoke").status_code == 404
    assert client.post("/users/ghost/accounts/x/grant").status_code == 404

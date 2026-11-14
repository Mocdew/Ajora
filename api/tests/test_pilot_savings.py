"""Pilot boundary, retry semantics and lifecycle acceptance."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
import json
import sqlite3
from uuid import uuid4

import pytest
from fastapi import Depends, Request
from fastapi.testclient import TestClient

from api import savings_storage
from api.main import app
from api.savings import circle_operation, current_user, database, get_savings_path
from api.tests.test_savings import create, fund, ready, savings  # noqa: F401
from api.tests.test_savings_reconciliation import configured, submit


def create_body():
    return {"name": "Pilot friends", "contribution_kobo": 1_000_000, "frequency": "weekly",
            "member_limit": 2, "start_date": (date.today() + timedelta(days=2)).isoformat()}


def test_demo_deployment_gate_prevents_fresh_manual_circles_only(savings, monkeypatch):
    clients, _ = savings
    owner = clients[0]
    existing = create(owner).json()
    monkeypatch.setenv("AJORA_MANUAL_SAVINGS_ENABLED", "false")
    assert create(owner).status_code == 403
    assert create(owner, mode="manual").status_code == 403
    assert create(owner, mode="demo").json()["mode"] == "demo"
    assert owner.get(f"/savings/circles/{existing['id']}").json()["mode"] == "manual"


def test_remote_manual_creation_requires_explicit_opt_in(tmp_path, monkeypatch):
    authoritative = tmp_path / "test-authoritative.sqlite3"
    monkeypatch.setenv("AJORA_REQUIRE_REMOTE_SAVINGS", "true")
    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://test.turso.io")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "test-token")
    monkeypatch.delenv("AJORA_MANUAL_SAVINGS_ENABLED", raising=False)
    monkeypatch.setattr(savings_storage, "_connect_remote",
                        lambda *_: sqlite3.connect(authoritative, isolation_level=None))
    with TestClient(app) as client:
        assert client.post("/savings/session", json={"display_name": "Tester"}).is_success
        assert create(client).status_code == 403
        assert create(client, mode="demo").is_success
        monkeypatch.setenv("AJORA_MANUAL_SAVINGS_ENABLED", "true")
        assert create(client).is_success


def test_manual_circle_excludes_simulations_even_with_legacy_markers(savings):
    clients, path = savings
    owner = clients[0]
    manual = create(owner).json()
    assert manual["mode"] == "manual"
    draft_path = f"/savings/circles/{manual['id']}"
    assert owner.post(f"{draft_path}/collection-account", json={"account_id": "demo-collection", "label": "Simulation"}).status_code == 409

    circle = ready(clients)
    base = f"/savings/circles/{circle['id']}"
    payment = submit(owner, base, "ajo-demo-reference", 1_000_000)
    assert owner.post(f"{base}/payments/{payment['id']}/match", json={"transaction_id": "simulated-1"}).status_code == 409
    assert owner.get(f"{base}/bank-feed").status_code == 409
    document = owner.get(base).json()
    document["collection_account"] = {"account_id": "demo-collection", "label": "Simulation", "source": "demo"}
    document["contributions"][0]["payments"][0].update(source="demo", status="confirmed", receipt_id="simulated-1")
    with database(path, write=True) as conn:
        conn.execute("UPDATE savings_circles SET document=? WHERE id=?", (json.dumps(document), circle["id"]))
    view = owner.get(base).json()
    assert view["mode"] == "manual"
    assert view["contributions"][0]["confirmed_kobo"] == view["contributions"][0]["matched_kobo"] == 0
    submit(clients[1], base, "real-reference", 1_000_000)
    real_payment = owner.get(base).json()["contributions"][1]["payments"][0]["id"]
    assert owner.post(f"{base}/payments/{real_payment}/confirm", json={}).status_code == 200
    assert owner.post(f"{base}/payouts", json={"round_number": 1, "reference": "invalid-funded-payout"}).status_code == 409


def test_old_demo_account_and_receipt_stay_demo(savings):
    clients, path = savings
    owner = clients[0]
    circle, base = configured(clients)
    receipt = owner.get(f"{base}/bank-feed").json()["transactions"][0]
    payment = submit(owner, base, receipt["reference"], receipt["amount_kobo"])
    approval = owner.post(f"{base}/payments/{payment['id']}/match", json={"transaction_id": receipt["id"]})
    assert approval.status_code == 200
    document = approval.json()
    document.pop("mode")
    with database(path, write=True) as conn:
        conn.execute("UPDATE savings_circles SET document=? WHERE id=?", (json.dumps(document), circle["id"]))
    view = owner.get(base).json()
    assert view["mode"] == "demo"
    assert view["contributions"][0]["matched_kobo"] == receipt["amount_kobo"]


def test_replaced_and_cancelled_invites_leave_member_history(savings):
    clients, _ = savings
    owner, member, outsider, *_ = clients
    circle = create(owner, rules="Private payment instructions").json()
    base = f"/savings/circles/{circle['id']}"
    old = circle["invite_code"]
    assert member.get(f"/savings/invitations/{old}").json()["rules"] == ""
    joined = member.post("/savings/join", json={"invite_code": old}).json()
    assert joined["rules"] == circle["rules"]
    assert member.post(f"{base}/rotate-invite", json={}).status_code == 403
    assert member.post(f"{base}/cancel-draft", json={}).status_code == 403
    owner.post(f"{base}/agreement/accept", json={"version": joined["agreement_version"]}).raise_for_status()
    rotated = owner.post(f"{base}/rotate-invite", json={}).json()
    new = rotated["invite_code"]
    assert new != old and rotated["agreement_version"] == joined["agreement_version"]
    assert outsider.post("/savings/join", json={"invite_code": old}).status_code == 404
    assert outsider.get(f"/savings/invitations/{old}").status_code == 404
    assert outsider.get(f"/savings/invitations/{new}").status_code == 200
    cancelled = owner.post(f"{base}/cancel-draft", json={}).json()
    assert cancelled["status"] == "cancelled"
    assert member.get(base).json()["acceptances"] == rotated["acceptances"]
    assert any(e["kind"] == "agreement_accepted" for e in cancelled["events"])
    assert outsider.post("/savings/join", json={"invite_code": new}).status_code == 404
    assert outsider.get(f"/savings/invitations/{cancelled['invite_code']}").status_code == 404
    assert owner.post(f"{base}/start", json={}).status_code == 409


def test_stale_manual_bulk_review_cannot_approve_unseen_instalment(savings):
    clients, _ = savings
    owner, member, *_ = clients
    circle = ready(clients)
    base = f"/savings/circles/{circle['id']}"
    first = submit(member, base, "seen-instalment", 450_000)
    submit(member, base, "unseen-instalment", 550_000)
    claim = owner.get(base).json()["contributions"][0]
    review = f"{base}/contributions/{claim['member_id']}/1"
    assert owner.post(f"{review}/confirm", json={}).status_code == 409
    assert owner.post(f"{review}/confirm", json={"payment_ids": [first["id"]]}).status_code == 409
    assert owner.post(f"{review}/reject", json={"payment_ids": [first["id"]], "reason": "Wrong details"}).status_code == 409
    confirmed = owner.post(f"{base}/payments/{first['id']}/confirm", json={}).json()
    assert confirmed["contributions"][0]["confirmed_kobo"] == 450_000
    assert confirmed["contributions"][0]["payments"][1]["status"] == "submitted"


def test_two_organiser_tabs_cannot_confirm_reopened_payment_using_stale_review(savings):
    clients, _ = savings
    owner, member, *_ = clients
    circle = ready(clients)
    base = f"/savings/circles/{circle['id']}"
    payment = submit(member, base, "review-twice", 1_000_000)
    review = f"{base}/payments/{payment['id']}"
    first = {"review_version": payment["review_version"]}
    confirmed = owner.post(f"{review}/confirm", json=first).json()["contributions"][0]["payments"][0]
    assert confirmed["review_version"] == first["review_version"] + 1
    result = owner.post(f"{review}/revoke", json={"reason": "Wrong reconciliation", "review_version": confirmed["review_version"]})
    corrected = result.json()["contributions"][0]["payments"][0]
    assert corrected["status"] == "submitted"
    assert corrected["review_version"] == confirmed["review_version"] + 1
    bulk = f"{base}/contributions/{result.json()['contributions'][0]['member_id']}/1"
    assert owner.post(f"{bulk}/confirm", json={"payment_ids": [payment["id"]]}).status_code == 409
    assert owner.post(f"{bulk}/confirm", json={"payment_versions": {payment["id"]: first["review_version"]}}).status_code == 409
    assert owner.post(f"{review}/confirm", json={}).status_code == 409
    assert owner.post(f"{review}/confirm", json=first).status_code == 409
    assert owner.post(f"{review}/reject", json={**first, "reason": "Stale decision"}).status_code == 409
    assert owner.post(f"{review}/confirm", json={"review_version": corrected["review_version"]}).status_code == 200


def test_dispute_races_payout_without_advancing_and_keeps_original_case(savings):
    clients, _ = savings
    owner, member, outsider, *_ = clients
    circle = ready(clients)
    fund(clients, circle, 1)
    base = f"/savings/circles/{circle['id']}"
    payment = owner.get(base).json()["contributions"][0]["payments"][0]
    report = {"round_number": 1, "reference": "external-payment"}
    with ThreadPoolExecutor(max_workers=2) as pool:
        payout = pool.submit(owner.post, f"{base}/payouts", json=report)
        flag = pool.submit(member.post, f"{base}/payments/{payment['id']}/dispute", json={"reason": "Bank entry was reversed"})
        payout_status = payout.result().status_code
        opened = flag.result().json()
    assert payout_status in (200, 409)
    case = opened["payment_disputes"][0]
    assert case["resolved_at"] is None
    if payout_status == 200:
        assert owner.post(f"{base}/payouts/1/receive", json={}).status_code == 409
    else:
        assert owner.post(f"{base}/payouts", json=report).status_code == 409
    assert owner.get(base).json()["current_round"] == 1
    resolve = f"{base}/payment-disputes/{case['id']}/resolve"
    assert outsider.post(resolve, json={"reason": "Test attempt"}).status_code == 403
    assert owner.post(resolve, json={"reason": "Test attempt"}).status_code == 403
    result = member.post(resolve, json={"reason": "Transfer reconciled in case review"}).json()
    closed = result["payment_disputes"][0]
    assert closed["reason"] == "Bank entry was reversed"
    assert closed["resolution"] == "Transfer reconciled in case review" and closed["resolved_at"]
    if payout_status == 409:
        assert owner.post(f"{base}/payouts", json=report).status_code == 200
    assert owner.post(f"{base}/payouts/1/receive", json={}).json()["current_round"] == 2


def test_keyed_savings_writes_replay_current_circle_and_reject_changed_intent(savings):
    clients, path = savings
    owner, member, outsider, *_ = clients
    owner_id = owner.get("/savings/session").json()["user_id"]
    key = str(uuid4())
    headers = {"Idempotency-Key": key, "X-Ajora-Actor": owner_id}
    body = create_body()

    def create_or_replay(_):
        with TestClient(app) as client:
            client.cookies.update(owner.cookies)
            return client.post("/savings/circles", json=body, headers=headers)

    with ThreadPoolExecutor(max_workers=2) as pool:
        created, replayed = list(pool.map(create_or_replay, range(2)))
    assert created.status_code == replayed.status_code == 201
    circle = created.json()
    assert replayed.json()["id"] == circle["id"]
    base = f"/savings/circles/{circle['id']}"
    assert outsider.get(f"/savings/operations/{key}").status_code == 404
    assert member.get(f"/savings/operations/{key}", headers={"X-Ajora-Actor": owner_id}).status_code == 409
    assert member.post("/savings/circles", json=body, headers=headers).status_code == 409
    assert owner.post("/savings/circles", json={**body, "name": "Changed"}, headers=headers).status_code == 409
    assert owner.post(f"{base}/start", json={}, headers=headers).status_code == 409
    joined = member.post("/savings/join", json={"invite_code": circle["invite_code"]}).json()
    version = joined["agreement_version"]
    for client in (owner, member):
        assert client.post(f"{base}/agreement/accept", json={"version": version}).status_code == 200
    assert owner.post(f"{base}/start", json={"agreement_version": version - 1}).status_code == 409

    def replay_twice(client, path, body):
        headers = {"Idempotency-Key": str(uuid4())}
        first = client.post(path, json=body, headers=headers)
        second = client.post(path, json=body, headers=headers)
        assert first.status_code == second.status_code == 200, first.text
        assert client.get(f"/savings/operations/{headers['Idempotency-Key']}").json() == second.json()
        return second.json()

    replay_twice(owner, f"{base}/start", {"agreement_version": version})
    claimed = replay_twice(member, f"{base}/contributions", {"round_number": 1, "reference": "one-claim"})
    payment_id = claimed["contributions"][0]["payments"][0]["id"]
    replay_twice(owner, f"{base}/payments/{payment_id}/confirm", {})
    other = submit(owner, base, "second-claim", 1_000_000)
    assert owner.post(f"{base}/payments/{other['id']}/confirm", json={}).status_code == 200
    replay_twice(owner, f"{base}/payouts", {"round_number": 1, "reference": "one-payout"})
    final = replay_twice(owner, f"{base}/payouts/1/receive", {})
    assert final["current_round"] == 2
    assert len(final["payouts"]) == 1 and len(final["contributions"]) == 2
    assert sum(e["kind"] == "circle_started" for e in final["events"]) == 1
    assert sum(e["kind"] == "payout_received" for e in final["events"]) == 1
    assert owner.get(f"/savings/operations/{key}").json() == final
    with database(path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_circles").fetchone()[0] == 1


def test_revoked_session_is_checked_inside_operation_write(savings, monkeypatch):
    clients, path = savings
    owner = clients[0]
    circle = create(owner).json()
    # Commit revocation after Depends checked the session and before the
    # ledger acquired its write lock.
    async def revoke_after_authentication(request: Request, user: dict = Depends(current_user)):
        operation = await circle_operation(request, user, key=None)
        with database(path, write=True) as conn:
            conn.execute("DELETE FROM savings_sessions WHERE token_hash=?", (operation.session_hash,))
        return operation

    monkeypatch.setitem(app.dependency_overrides, circle_operation, revoke_after_authentication)
    result = owner.post(f"/savings/circles/{circle['id']}/rotate-invite", json={})
    assert result.status_code == 401
    assert owner.get("/savings/session").status_code == 401
    with database(path) as conn:
        assert conn.execute("SELECT invite_code FROM savings_circles WHERE id=?", (circle["id"],)).fetchone()[0] == circle["invite_code"]


def test_invite_attempt_limit_counts_failed_preview_and_join_by_member(savings):
    clients, _ = savings
    owner, member, outsider, *_ = clients
    circle = create(owner).json()
    invite = f"/savings/invitations/{circle['invite_code']}"
    for _ in range(15):
        assert member.get("/savings/invitations/wrong-code").status_code == 404
        assert member.post("/savings/join", json={"invite_code": "wrong-code"}).status_code == 404
    blocked = member.get(invite)
    assert blocked.status_code == 429 and int(blocked.headers["Retry-After"]) > 0
    assert outsider.get(invite).status_code == 200


def test_logged_out_guest_and_circle_creation_have_independent_buckets(savings):
    clients, _ = savings
    owner, member, *_ = clients
    body = create_body()
    headers = {"Idempotency-Key": str(uuid4())}
    committed = owner.post("/savings/circles", json=body, headers=headers).json()
    for _ in range(9):
        assert create(owner).status_code == 201
    assert create(owner).status_code == 429
    assert owner.post("/savings/circles", json=body, headers=headers).json() == committed
    assert create(member).status_code == 201
    with TestClient(app, client=("192.0.2.3", 1000)) as guest:
        for _ in range(20):
            guest.cookies.clear()
            assert guest.post("/savings/session", json={"display_name": "Test guest"}).status_code == 201
        guest.cookies.clear()
        assert guest.post("/savings/session", json={"display_name": "Another guest"}).status_code == 429
    with TestClient(app, client=("192.0.2.4", 1000)) as guest:
        assert guest.post("/savings/session", json={"display_name": "Other address"}).status_code == 201


@pytest.mark.parametrize("driver", ["sqlite3", "libsql"])
def test_remote_wrapper_recovers_after_commit_acknowledgement_is_lost(monkeypatch, tmp_path, driver):
    remote_path = tmp_path / "remote.sqlite3"
    local_path = tmp_path / "forbidden-local" / "savings.sqlite3"
    connect = (sqlite3 if driver == "sqlite3" else pytest.importorskip("libsql")).connect

    class LostAcknowledgement:
        lost_once = False

        def __init__(self):
            self.connection = connect(str(remote_path), isolation_level=None)
            self.has_operation = False

        def __getattr__(self, name):
            return getattr(self.connection, name)

        def execute(self, sql, parameters=()):
            if sql.startswith("INSERT INTO savings_operations"):
                self.has_operation = True
            return self.connection.execute(sql, parameters)

        def commit(self):
            self.connection.commit()
            if self.has_operation and not type(self).lost_once:
                type(self).lost_once = True
                raise RuntimeError("simulated acknowledgement loss")

    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://isolated-test.turso.io")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", uuid4().hex)
    monkeypatch.setenv("AJORA_REQUIRE_REMOTE_SAVINGS", "true")
    monkeypatch.setenv("AJORA_MANUAL_SAVINGS_ENABLED", "true")
    monkeypatch.setitem(app.dependency_overrides, get_savings_path, lambda: local_path)
    monkeypatch.setattr(savings_storage, "_connect_remote", lambda *_: LostAcknowledgement())
    key = str(uuid4())
    headers = {"Idempotency-Key": key}
    body = create_body()
    with TestClient(app, raise_server_exceptions=False) as owner:
        assert owner.post("/savings/session", json={"display_name": "Pilot organiser"}).status_code == 201
        response = owner.post("/savings/circles", json=body, headers=headers)
        assert response.status_code >= 500
        assert LostAcknowledgement.lost_once
        assert "simulated acknowledgement loss" not in response.text
        restored = owner.get(f"/savings/operations/{key}")
        assert restored.status_code == 200
        retried = owner.post("/savings/circles", json=body, headers=headers)
        assert retried.status_code == 201 and retried.json() == restored.json()
        assert len(owner.get("/savings/circles").json()) == 1
    assert not local_path.parent.exists()


def test_abandon_races_with_original_and_cannot_discard_another_actors_write(savings):
    clients, _ = savings
    owner, outsider, *_ = clients
    key = str(uuid4())
    body = create_body()
    headers = {"Idempotency-Key": key}
    path = f"/savings/operations/{key}"
    assert outsider.post(f"{path}/abandon", json={}).json() is None

    with TestClient(app) as second_tab, ThreadPoolExecutor(max_workers=2) as pool:
        second_tab.cookies.update(owner.cookies)
        create_result = pool.submit(owner.post, "/savings/circles", json=body, headers=headers)
        discard_result = pool.submit(second_tab.post, f"{path}/abandon", json={})
        created = create_result.result()
        discarded = discard_result.result()

    assert discarded.is_success
    if discarded.json() is None:
        assert created.status_code == 409
        assert owner.get(path).status_code == 404
        assert owner.post("/savings/circles", json=body, headers=headers).status_code == 409
        assert owner.get("/savings/circles").json() == []
    else:
        assert created.status_code == 201
        assert discarded.json() == created.json() == owner.get(path).json()
        assert len(owner.get("/savings/circles").json()) == 1
    assert owner.post(f"{path}/abandon", json={}).json() == discarded.json()

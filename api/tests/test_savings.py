"""Savings agreements, permissions, money and lifecycle regressions."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
import sqlite3

from fastapi.testclient import TestClient
import pytest

from api.main import app
from api.savings import database, due_dates, get_savings_path


@pytest.fixture
def savings(tmp_path):
    path = tmp_path / "savings.sqlite3"
    app.dependency_overrides[get_savings_path] = lambda: path
    clients = [TestClient(app) for _ in range(4)]
    for index, client in enumerate(clients):
        assert client.post("/savings/session", json={"display_name": f"Member {index}"}).status_code == 201
    yield clients, path
    for client in clients:
        client.close()
    app.dependency_overrides.pop(get_savings_path, None)


def create(owner, **overrides):
    body = {"name": "Market Friends", "contribution_kobo": 1_000_000, "frequency": "weekly", "member_limit": 2,
            "start_date": (date.today() + timedelta(days=2)).isoformat(), "rules": "Contribute each Friday."}
    body.update(overrides)
    return owner.post("/savings/circles", json=body)


def ready(clients):
    owner, member, *_ = clients
    circle = create(owner).json()
    assert member.post("/savings/join", json={"invite_code": circle["invite_code"]}).status_code == 200
    accepted_circle = owner.get(f"/savings/circles/{circle['id']}").json()
    for client in (owner, member):
        assert client.post(f"/savings/circles/{circle['id']}/agreement/accept", json={"version": accepted_circle["agreement_version"]}).status_code == 200
    return owner.post(f"/savings/circles/{circle['id']}/start", json={}).json()


def fund(clients, circle, number):
    base = f"/savings/circles/{circle['id']}"
    owner, member, *_ = clients
    for client in [owner, member]:
        user = client.get("/savings/session").json()
        assert client.post(f"{base}/contributions", json={"round_number": number, "reference": f"transfer-{number}-{user['user_id']}"}).status_code == 200
        assert owner.post(f"{base}/contributions/{user['user_id']}/{number}/confirm", json={}).status_code == 200


def test_complete_lifecycle_and_durable_restart(savings):
    clients, path = savings
    owner, member, *_ = clients
    circle = ready(clients)
    base = f"/savings/circles/{circle['id']}"
    fund(clients, circle, 1)
    response = owner.post(f"{base}/payouts", json={"round_number": 1, "reference": "first-external-payout"})
    assert response.status_code == 200
    assert response.json()["current_round"] == 1
    assert response.json()["payouts"][0]["status"] == "sent"
    response = owner.post(f"{base}/payouts/1/receive", json={})
    assert response.json()["current_round"] == 2
    assert response.json()["payouts"][0]["amount_kobo"] == 2_000_000
    assert response.json()["payouts"][0]["member_id"] == circle["members"][0]["user_id"]
    # Every operation opens a fresh connection: the stored state is authoritative.
    with database(path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_circles").fetchone()[0] == 1
    assert member.get(base).json()["payouts"] == response.json()["payouts"]
    fund(clients, circle, 2)
    stale = owner.post(f"{base}/payouts", json={"round_number": 1, "reference": "first-external-payout"})
    assert stale.status_code == 409
    owner.post(f"{base}/payouts", json={"round_number": 2, "reference": "second-external-payout"})
    final = member.post(f"{base}/payouts/2/receive", json={}).json()
    assert final["status"] == "completed"
    assert len(final["payouts"]) == 2
    assert owner.post(f"{base}/payouts", json={"round_number": 2, "reference": "duplicate"}).status_code == 409
    assert member.post(f"{base}/contributions", json={"round_number": 2, "reference": "late"}).status_code == 409
    recovered = TestClient(app)
    recovered.cookies.update(owner.cookies)
    assert recovered.get(base).json() == final


def test_browser_identity_is_secret_and_not_replaceable(savings):
    clients, path = savings
    owner = clients[0]
    unknown = TestClient(app)
    assert unknown.get("/savings/circles").status_code == 401
    assert unknown.get("/savings/session").status_code == 401
    unknown.cookies.set("ajora_savings_session", owner.get("/savings/session").json()["user_id"])
    assert unknown.get("/savings/session").status_code == 401
    assert owner.post("/savings/session", json={"display_name": "Replacement"}).status_code == 409
    assert owner.get("/savings/session").json()["display_name"] == "Member 0"
    with sqlite3.connect(path) as conn:
        token = conn.execute("SELECT token_hash FROM savings_sessions LIMIT 1").fetchone()[0]
        assert len(token) == 64
        assert token != owner.cookies.get("ajora_savings_session")
    response = unknown.post("/savings/session", json={"display_name": "New Member"})
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]


def test_private_membership_and_organiser_permissions(savings):
    clients, _ = savings
    owner, member, outsider, *_ = clients
    circle = create(owner).json()
    base = f"/savings/circles/{circle['id']}"
    assert outsider.get(base).status_code == 403
    assert outsider.get("/savings/circles").json() == []
    assert owner.post(f"{base}/start", json={}).status_code == 409
    assert member.post("/savings/join", json={"invite_code": circle["invite_code"].lower()}).status_code == 200
    assert member.post("/savings/join", json={"invite_code": circle["invite_code"]}).status_code == 409
    assert outsider.post("/savings/join", json={"invite_code": circle["invite_code"]}).status_code == 409
    assert member.post(f"{base}/start", json={}).status_code == 403
    assert member.post(f"{base}/order", json={"member_ids": []}).status_code == 422
    ids = [m["user_id"] for m in member.get(base).json()["members"]]
    assert member.post(f"{base}/order", json={"member_ids": ids}).status_code == 403
    assert owner.post(f"{base}/order", json={"member_ids": [ids[0], ids[0]]}).status_code == 422
    changed = owner.post(f"{base}/order", json={"member_ids": ids[::-1]}).json()
    assert changed["members"][0]["user_id"] == ids[1]
    for client in (owner, member):
        assert client.post(f"{base}/agreement/accept", json={"version": changed["agreement_version"]}).status_code == 200
    assert owner.post(f"{base}/start", json={}).status_code == 200
    assert owner.post(f"{base}/order", json={"member_ids": ids}).status_code == 409
    assert owner.post(f"{base}/start", json={}).status_code == 409
    assert member.post(f"{base}/payouts", json={"round_number": 1, "reference": "fake-payment"}).status_code == 403


def test_contribution_claims_require_receipt_confirmation(savings):
    clients, _ = savings
    owner, member, outsider, *_ = clients
    circle = ready(clients)
    base = f"/savings/circles/{circle['id']}"
    uid = member.get("/savings/session").json()["user_id"]
    assert member.post(f"{base}/contributions", json={"round_number": 2, "reference": "future"}).status_code == 409
    assert owner.post(f"{base}/contributions/{uid}/1/confirm", json={}).status_code == 404
    claim = {"round_number": 1, "reference": "bank-ref-100"}
    result = member.post(f"{base}/contributions", json=claim)
    assert result.json()["contributions"][0]["status"] == "submitted"
    assert member.post(f"{base}/contributions", json=claim).status_code == 409
    assert outsider.post(f"{base}/contributions", json=claim).status_code == 403
    assert owner.post(f"{base}/payouts", json={"round_number": 1, "reference": "too-early"}).status_code == 409
    assert member.post(f"{base}/contributions/{uid}/1/confirm", json={}).status_code == 403
    assert owner.post(f"{base}/contributions/{uid}/1/confirm", json={}).status_code == 200
    assert owner.post(f"{base}/contributions/{uid}/1/confirm", json={}).status_code == 409
    assert owner.post(f"{base}/payouts", json={"round_number": 1, "reference": "still-short"}).status_code == 409


@pytest.mark.parametrize("overrides", [
    {"contribution_kobo": -1}, {"contribution_kobo": 10.5}, {"contribution_kobo": True},
    {"contribution_kobo": "100"}, {"member_limit": 1}, {"member_limit": 51},
    {"frequency": "daily"}, {"name": " "}, {"start_date": "2020-01-01"},
])
def test_invalid_circle_rules(savings, overrides):
    clients, _ = savings
    assert create(clients[0], **overrides).status_code == 422
    assert clients[0].get("/savings/circles").json() == []


def test_monthly_dates_keep_original_day_and_handle_leap_year():
    assert due_dates(date(2028, 1, 31), "monthly", 3) == ["2028-01-31", "2028-02-29", "2028-03-31"]


def test_concurrent_join_cannot_overfill_circle(savings):
    clients, _ = savings
    owner, first, second, *_ = clients
    circle = create(owner).json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda client: client.post("/savings/join", json={"invite_code": circle["invite_code"]}), [first, second]))
    assert sorted(r.status_code for r in responses) == [200, 409]
    assert len(owner.get(f"/savings/circles/{circle['id']}").json()["members"]) == 2


def test_concurrent_payout_cannot_advance_twice(savings):
    clients, _ = savings
    circle = ready(clients)
    fund(clients, circle, 1)
    cookies = clients[0].cookies
    with ThreadPoolExecutor(max_workers=2) as pool:
        def payout(index):
            with TestClient(app) as client:
                client.cookies.update(cookies)
                return client.post(f"/savings/circles/{circle['id']}/payouts", json={"round_number": 1, "reference": f"payout-{index}"})
        responses = list(pool.map(payout, [1, 2]))
    assert sorted(r.status_code for r in responses) == [200, 409]
    result = clients[0].get(f"/savings/circles/{circle['id']}").json()
    assert len(result["payouts"]) == 1
    assert result["current_round"] == 1
    with ThreadPoolExecutor(max_workers=2) as pool:
        def receive(_):
            with TestClient(app) as client:
                client.cookies.update(cookies)
                return client.post(f"/savings/circles/{circle['id']}/payouts/1/receive", json={})
        responses = list(pool.map(receive, [1, 2]))
    assert [r.status_code for r in responses] == [200, 200]
    assert clients[0].get(f"/savings/circles/{circle['id']}").json()["current_round"] == 2


def test_invitation_preview_excludes_member_details(savings):
    clients, _ = savings
    owner, outsider, *_ = clients
    circle = create(owner).json()
    preview = outsider.get(f"/savings/invitations/{circle['invite_code']}")
    assert preview.status_code == 200
    assert preview.json()["rules"] == circle["rules"]
    assert preview.json()["member_count"] == 1
    assert "members" not in preview.json()
    assert "organizer_id" not in preview.json()
    assert TestClient(app).get(f"/savings/invitations/{circle['invite_code']}").status_code == 401


def test_rejected_claim_can_be_corrected_without_erasing_history(savings):
    clients, _ = savings
    owner, member, *_ = clients
    circle = ready(clients)
    base = f"/savings/circles/{circle['id']}"
    uid = member.get("/savings/session").json()["user_id"]
    path = f"{base}/contributions/{uid}/1"
    assert member.post(f"{base}/contributions", json={"round_number": 1, "reference": "wrong-ref"}).status_code == 200
    assert member.post(f"{path}/reject", json={"reason": "No matching receipt"}).status_code == 403
    rejected = owner.post(f"{path}/reject", json={"reason": "No matching receipt"}).json()
    assert rejected["contributions"][0]["status"] == "rejected"
    assert owner.post(f"{path}/confirm", json={}).status_code == 409
    assert owner.post(f"{path}/reject", json={"reason": "Repeated rejection"}).status_code == 409
    fixed = member.post(f"{base}/contributions", json={"round_number": 1, "reference": "correct-ref"}).json()["contributions"][0]
    assert fixed["status"] == "submitted"
    assert fixed["rejection_reason"] is None
    assert fixed["history"][0]["reference"] == "wrong-ref"
    assert fixed["history"][0]["rejection_reason"] == "No matching receipt"
    assert owner.post(f"{path}/confirm", json={}).status_code == 200
    assert owner.post(f"{path}/reject", json={"reason": "Cannot reject confirmed"}).status_code == 409

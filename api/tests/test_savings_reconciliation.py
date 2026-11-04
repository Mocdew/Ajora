"""Contribution evidence, agreements and recipient acknowledgements."""
from concurrent.futures import ThreadPoolExecutor
import json

from fastapi.testclient import TestClient

from api.main import app
from api.savings import database
from api.savings_feed import BankFeed, BankReceipt, get_bank_feed_provider
from api.tests.test_savings import create, fund, ready, savings  # noqa: F401


def configured(clients):
    owner, member, *_ = clients
    circle = create(owner).json()
    base = f"/savings/circles/{circle['id']}"
    assert member.post("/savings/join", json={"invite_code": circle["invite_code"]}).status_code == 200
    circle = owner.post(f"{base}/collection-account", json={"account_id": "demo-collection", "label": "Friends collection (demo)"}).json()
    for client in (owner, member):
        assert client.post(f"{base}/agreement/accept", json={"version": circle["agreement_version"]}).status_code == 200
    response = owner.post(f"{base}/start", json={})
    assert response.status_code == 200
    return response.json(), base


def submit(client, base, reference, amount):
    response = client.post(f"{base}/contributions", json={"round_number": 1, "reference": reference, "amount_kobo": amount})
    assert response.status_code == 200, response.text
    uid = client.get("/savings/session").json()["user_id"]
    return next(c for c in response.json()["contributions"] if c["member_id"] == uid)["payments"][-1]


def test_two_instalments_match_without_counting_claims_as_received(savings):
    clients, path = savings
    owner, member, outsider, *_ = clients
    circle, base = configured(clients)
    assert member.get(f"{base}/bank-feed").status_code == 403
    feed = owner.get(f"{base}/bank-feed").json()
    assert feed["source"] == "demo" and "Simulated" in feed["notice"]
    receipts = feed["transactions"][:2]
    first = submit(owner, base, receipts[0]["reference"], receipts[0]["amount_kobo"])
    assert owner.get(base).json()["contributions"][0]["confirmed_kobo"] == 0
    assert outsider.post(f"{base}/payments/{first['id']}/match", json={"transaction_id": receipts[0]["id"]}).status_code == 403
    assert member.post(f"{base}/payments/{first['id']}/match", json={"transaction_id": receipts[0]["id"]}).status_code == 403
    match = owner.post(f"{base}/payments/{first['id']}/match", json={"transaction_id": receipts[0]["id"]})
    assert match.status_code == 200
    claim = match.json()["contributions"][0]
    assert claim["status"] == "submitted" and claim["confirmed_kobo"] == receipts[0]["amount_kobo"]
    assert claim["payments"][0]["source"] == "demo"
    assert owner.post(f"{base}/payouts", json={"round_number": 1, "reference": "too-soon"}).status_code == 409
    second = submit(owner, base, receipts[1]["reference"], receipts[1]["amount_kobo"])
    match = owner.post(f"{base}/payments/{second['id']}/match", json={"transaction_id": receipts[1]["id"]})
    assert match.json()["contributions"][0]["confirmed_kobo"] == circle["contribution_kobo"]
    assert match.json()["contributions"][0]["matched_kobo"] == circle["contribution_kobo"]
    assert match.json()["contributions"][0]["status"] == "confirmed"
    assert owner.post(f"{base}/payments/{second['id']}/match", json={"transaction_id": receipts[1]["id"]}).status_code == 409
    with database(path) as conn:
        assert conn.execute("SELECT count(*) FROM savings_receipts").fetchone()[0] == 2
    assert "sender_name" not in path.read_bytes().decode(errors="ignore")


def test_references_amounts_and_limits_are_conservative(savings):
    clients, _ = savings
    owner, member, *_ = clients
    _, base = configured(clients)
    receipt = owner.get(f"{base}/bank-feed").json()["transactions"][0]
    payment = submit(owner, base, receipt["reference"], receipt["amount_kobo"] - 1)
    assert owner.get(f"{base}/bank-feed").json()["matches"] == []
    assert owner.post(f"{base}/payments/{payment['id']}/match", json={"transaction_id": receipt["id"]}).status_code == 409
    assert member.post(f"{base}/contributions", json={"round_number": 1, "reference": receipt["reference"].lower(), "amount_kobo": 100}).status_code == 409
    assert owner.post(f"{base}/contributions", json={"round_number": 1, "reference": "too-large", "amount_kobo": 1_000_000}).status_code == 409
    assert owner.post(f"{base}/contributions", json={"round_number": 1, "reference": "not-an-integer", "amount_kobo": True}).status_code == 422


def test_bulk_actions_cannot_confirm_or_reject_a_partial_claim_without_pending_payments(savings):
    clients, _ = savings
    owner = clients[0]
    _, base = configured(clients)
    payment = submit(owner, base, "partially-funded", 250_000)
    result = owner.post(f"{base}/payments/{payment['id']}/confirm", json={})
    assert result.status_code == 200
    claim = result.json()["contributions"][0]
    assert claim["status"] == "submitted" and claim["confirmed_kobo"] == 250_000
    claim_base = f"{base}/contributions/{claim['member_id']}/1"
    assert owner.post(f"{claim_base}/confirm", json={}).status_code == 409
    assert owner.post(f"{claim_base}/reject", json={"reason": "No pending payment"}).status_code == 409
    assert owner.get(base).json() == result.json()


def test_ambiguous_feed_never_matches_and_receipt_cannot_be_reused_across_circles(savings):
    clients, _ = savings
    owner = clients[0]
    class Provider:
        ambiguous = True
        def get_feed(self, circle):
            receipt = dict(amount_kobo=circle["contribution_kobo"], reference="shared-bank-reference",
                sender_name="Sender", occurred_at="2026-11-04T10:00:00Z")
            transactions = [BankReceipt(id="bank-receipt-1", **receipt)]
            if self.ambiguous:
                transactions.append(BankReceipt(id="bank-receipt-2", **receipt))
            return BankFeed(account_id="demo-collection", refreshed_at="2026-11-04T10:00:00Z", transactions=transactions)
    provider = Provider()
    app.dependency_overrides[get_bank_feed_provider] = lambda: provider
    try:
        _, first_base = configured(clients)
        payment = submit(owner, first_base, "shared-bank-reference", 1_000_000)
        assert owner.get(f"{first_base}/bank-feed").json()["matches"] == []
        assert owner.post(f"{first_base}/payments/{payment['id']}/match", json={"transaction_id": "bank-receipt-1"}).status_code == 409
        provider.ambiguous = False
        assert owner.post(f"{first_base}/payments/{payment['id']}/match", json={"transaction_id": "bank-receipt-1"}).status_code == 200
        _, second_base = configured(clients)
        duplicate = submit(owner, second_base, "shared-bank-reference", 1_000_000)
        assert owner.post(f"{second_base}/payments/{duplicate['id']}/match", json={"transaction_id": "bank-receipt-1"}).status_code == 409
    finally:
        app.dependency_overrides.pop(get_bank_feed_provider, None)


def test_agreement_acceptance_invalidates_on_join_reorder_and_account_change(savings):
    clients, _ = savings
    owner, member, *_ = clients
    circle = create(owner).json()
    base = f"/savings/circles/{circle['id']}"
    assert owner.post(f"{base}/agreement/accept", json={"version": 1}).status_code == 200
    joined = member.post("/savings/join", json={"invite_code": circle["invite_code"]}).json()
    assert joined["acceptances"] == []
    assert owner.post(f"{base}/agreement/accept", json={"version": 1}).status_code == 409
    assert owner.post(f"{base}/start", json={}).status_code == 409
    for client in (owner, member):
        assert client.post(f"{base}/agreement/accept", json={"version": joined["agreement_version"]}).status_code == 200
    reversed_order = [m["user_id"] for m in joined["members"]][::-1]
    revised = owner.post(f"{base}/order", json={"member_ids": reversed_order}).json()
    assert revised["acceptances"] == []
    accepted_event = next(e for e in revised["events"] if e["kind"] == "agreement_accepted")
    assert accepted_event["agreement"]["agreement_version"] == 1
    assert accepted_event["agreement"]["members"][0]["user_id"] == owner.get("/savings/session").json()["user_id"]
    changed = owner.post(f"{base}/collection-account", json={"account_id": "demo-collection", "label": "Demo circle"}).json()
    assert changed["agreement_version"] == revised["agreement_version"] + 1


def test_payout_receipt_and_dispute_control_progression(savings):
    clients, _ = savings
    owner, member, outsider, *_ = clients
    circle = ready(clients)
    base = f"/savings/circles/{circle['id']}"
    fund(clients, circle, 1)
    # First payout is to the organiser. Other members cannot claim receipt.
    sent = owner.post(f"{base}/payouts", json={"round_number": 1, "reference": "external-payout-one"}).json()
    assert sent["current_round"] == 1 and sent["payouts"][0]["status"] == "sent"
    assert member.post(f"{base}/payouts/1/receive", json={}).status_code == 403
    assert outsider.post(f"{base}/payouts/1/dispute", json={"reason": "Missing"}).status_code == 403
    disputed = owner.post(f"{base}/payouts/1/dispute", json={"reason": "Transfer has not arrived"}).json()
    assert disputed["payouts"][0]["status"] == "disputed" and disputed["current_round"] == 1
    uid = owner.get("/savings/session").json()["user_id"]
    payment_id = next(c for c in sent["contributions"] if c["member_id"] == uid)["payments"][0]["id"]
    assert owner.post(f"{base}/payments/{payment_id}/revoke", json={"reason": "Wrong confirmation"}).status_code == 409
    received = owner.post(f"{base}/payouts/1/receive", json={}).json()
    assert received["current_round"] == 2 and received["payouts"][0]["status"] == "received"
    assert received["payouts"][0]["received_at"]
    assert owner.post(f"{base}/payouts/1/receive", json={}).json()["current_round"] == 2
    assert any(e["kind"] == "payout_disputed" for e in received["events"])
    flagged = member.post(f"{base}/payments/{payment_id}/dispute", json={"reason": "Please review this earlier payment"})
    assert flagged.status_code == 200
    assert flagged.json()["events"][-1]["kind"] == "payment_disputed"
    assert flagged.json()["current_round"] == 2


def test_correction_preserves_events_and_releases_receipt(savings):
    clients, _ = savings
    owner, member, *_ = clients
    _, base = configured(clients)
    receipt = owner.get(f"{base}/bank-feed").json()["transactions"][0]
    payment = submit(owner, base, receipt["reference"], receipt["amount_kobo"])
    matched = owner.post(f"{base}/payments/{payment['id']}/match", json={"transaction_id": receipt["id"]}).json()
    old_events = matched["events"]
    assert member.post(f"{base}/payments/{payment['id']}/revoke", json={"reason": "Wrong recipient"}).status_code == 403
    corrected = owner.post(f"{base}/payments/{payment['id']}/revoke", json={"reason": "Wrong allocation"}).json()
    assert corrected["events"][:len(old_events)] == old_events
    assert corrected["contributions"][0]["confirmed_kobo"] == 0
    assert "Wrong allocation" in corrected["events"][-1]["detail"]
    assert owner.post(f"{base}/payments/{payment['id']}/match", json={"transaction_id": receipt["id"]}).status_code == 200


def test_legacy_records_remain_manual_and_do_not_invent_receipt(savings):
    clients, path = savings
    owner = clients[0]
    circle = ready(clients)
    base = f"/savings/circles/{circle['id']}"
    fund(clients, circle, 1)
    document = owner.get(base).json()
    for claim in document["contributions"]:
        for key in ("payments", "confirmed_kobo", "matched_kobo"):
            claim.pop(key)
    document["payouts"] = [{"round_number": 1, "member_id": circle["members"][0]["user_id"], "amount_kobo": 2_000_000,
        "reference": "old-payout", "recorded_at": "2026-11-04T10:00:00Z"}]
    document["current_round"] = 2
    for key in ("collection_account", "agreement_version", "acceptances", "events"):
        document.pop(key)
    with database(path, write=True) as conn:
        conn.execute("UPDATE savings_circles SET document=? WHERE id=?", (json.dumps(document), circle["id"]))
    legacy = owner.get(base).json()
    assert legacy["contributions"][0]["confirmed_kobo"] == circle["contribution_kobo"]
    assert legacy["contributions"][0]["matched_kobo"] == 0
    assert legacy["payouts"][0]["status"] == "legacy_recorded"
    assert legacy["payouts"][0]["received_at"] is None
    assert owner.post(f"{base}/payouts/1/receive", json={}).status_code == 409


def test_concurrent_instalments_and_receipt_approval_are_atomic(savings):
    clients, _ = savings
    owner = clients[0]
    _, base = configured(clients)
    cookies = owner.cookies
    with ThreadPoolExecutor(max_workers=2) as pool:
        def claim(index):
            with TestClient(app) as client:
                client.cookies.update(cookies)
                return client.post(f"{base}/contributions", json={"round_number": 1,
                    "reference": f"parallel-{index}", "amount_kobo": 600_000})
        results = list(pool.map(claim, [1, 2]))
    assert sorted(r.status_code for r in results) == [200, 409]
    circle = owner.get(base).json()
    payment = circle["contributions"][0]["payments"][0]
    assert owner.post(f"{base}/payments/{payment['id']}/reject", json={"reason": "Use the matching reference"}).status_code == 200
    receipt = owner.get(f"{base}/bank-feed").json()["transactions"][0]
    payment = submit(owner, base, receipt["reference"], receipt["amount_kobo"])
    with ThreadPoolExecutor(max_workers=2) as pool:
        def match(_):
            with TestClient(app) as client:
                client.cookies.update(cookies)
                return client.post(f"{base}/payments/{payment['id']}/match", json={"transaction_id": receipt["id"]})
        results = list(pool.map(match, [1, 2]))
    assert sorted(r.status_code for r in results) == [200, 409]
    assert owner.get(base).json()["contributions"][0]["confirmed_kobo"] == receipt["amount_kobo"]

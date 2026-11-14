import csv
from io import StringIO

from fastapi.testclient import TestClient

from api.main import app
from api.tests.test_savings import create, fund, ready, savings  # noqa: F401
from api.tests.test_savings_reconciliation import configured, submit


def test_member_export_matches_ledger_and_keeps_invites_private(savings):
    clients, _ = savings
    owner, member, outsider, *_ = clients
    circle = ready(clients)
    base = f"/savings/circles/{circle['id']}"
    fund(clients, circle, 1)
    assert owner.post(f"{base}/payouts", json={"round_number": 1, "reference": "external-reference"}).is_success
    assert owner.post(f"{base}/payouts/1/receive", json={}).is_success
    live = owner.get(base).json()
    invite = live.pop("invite_code")
    assert TestClient(app).get(f"{base}/export").status_code == 401
    assert outsider.get(f"{base}/export").status_code == 403
    response = member.get(f"{base}/export")
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-disposition"] == 'attachment; filename="ajora-savings.json"'
    assert response.json()["circle"] == live
    text = member.get(f"{base}/export?format=text")
    assert text.is_success
    assert invite not in response.text + text.text
    assert "confirmed NGN 20,000.00" in text.text
    assert "Recipient confirmed" in text.text
    assert "Agreement v" in text.text


def test_export_labels_simulation_and_escapes_spreadsheet_formulas(savings):
    clients, _ = savings
    owner, member, *_ = clients
    _, base = configured(clients)
    receipt = owner.get(f"{base}/bank-feed").json()["transactions"][0]
    claim = submit(owner, base, receipt["reference"], receipt["amount_kobo"])
    assert owner.post(f"{base}/payments/{claim['id']}/match", json={"transaction_id": receipt["id"]}).is_success
    injected = '=HYPERLINK("https://example.com")\nPayout spoof\u202e'
    submit(member, base, injected, 25_001)
    text = member.get(f"{base}/export?format=text")
    assert "Demo circle" in text.text
    assert "simulated receipt" in text.text
    assert "\nPayout spoof" not in text.text and "\u202e" not in text.text
    csv_export = member.get(f"{base}/export?format=csv")
    assert csv_export.headers["content-type"].startswith("text/csv")
    values = [value for _, value in list(csv.reader(StringIO(csv_export.text)))[1:]]
    assert "'" + injected in values
    assert "demo" in values
    assert "25001" in values
    assert injected not in values


def test_draft_export_quotes_formula_like_metadata(savings):
    owner = savings[0][0]
    circle = create(owner, name="@SUM(4,1)", rules="  +Any input").json()
    response = owner.get(f"/savings/circles/{circle['id']}/export?format=csv")
    values = dict(csv.reader(StringIO(response.text)))
    assert values["circle.name"] == "'@SUM(4,1)"
    assert values["circle.rules"] == "'+Any input"

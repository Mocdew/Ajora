"""Private imports stay outside the labelled eval set and use explicit FX rates."""

import json

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from api import providers
from api.deps import get_provider
from api.main import app
from api.providers import FilePersonaProvider
from engine.schemas.transaction import TransactionBatch


def _write_batch(path, user_id="u_private", rates=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    common = dict(institution="test", timestamp="2026-10-19T09:22:00Z")
    batch = {
        "user": {"user_id": user_id, "full_name": "Test Account Holder", "account_ids": ["eur", "ngn"]},
        "fx_rates_ngn": rates if rates is not None else {"EUR": 1500.0},
        "transactions": [
            dict(common, id="income", account_id="eur", amount=10, currency="EUR", direction="credit", narration="Work payment"),
            dict(common, id="support", account_id="eur", amount=2, currency="EUR", direction="debit", narration="Support for mama", counterparty_name="MAMA TEST"),
            dict(common, id="swap-out", account_id="eur", amount=1, currency="EUR", direction="debit", narration="Swap from EUR to NGN", reference="SAMESWAP123"),
            dict(common, id="swap-in", account_id="ngn", amount=1500, currency="NGN", direction="credit", narration="Swap from EUR to NGN", reference="SAMESWAP123"),
        ],
    }
    path.write_text(json.dumps(batch))
    return batch


def test_default_provider_discovers_private_files_but_custom_roots_are_isolated(tmp_path, monkeypatch):
    monkeypatch.delenv("AJORA_PERSONA_PATH", raising=False)
    mock = tmp_path / "mock"
    private = tmp_path / "private"
    sample = tmp_path / "sample.json"
    _write_batch(mock / "persona_demo.json", user_id="u_demo")
    _write_batch(private / "persona_private.json")
    monkeypatch.setattr(providers, "_MOCK_DIR", mock)
    monkeypatch.setattr(providers, "_PRIVATE_DIR", private)
    monkeypatch.setattr(providers, "_SAMPLE_PATH", sample)
    assert FilePersonaProvider().list_users() == ["u_demo", "u_private"]
    assert FilePersonaProvider(mock_dir=mock, sample_path=sample).list_users() == ["u_demo"]
    _write_batch(private / "persona_duplicate.json", user_id="u_demo")
    with pytest.raises(ValueError, match="Duplicate persona"):
        FilePersonaProvider()


def test_secret_persona_file_is_loaded_only_by_default_provider(tmp_path, monkeypatch):
    mock = tmp_path / "mock"
    sample = tmp_path / "sample.json"
    secret = tmp_path / "secrets" / "private.json"
    _write_batch(mock / "persona_demo.json", user_id="u_demo")
    _write_batch(secret)
    monkeypatch.setattr(providers, "_MOCK_DIR", mock)
    monkeypatch.setattr(providers, "_PRIVATE_DIR", tmp_path / "private")
    monkeypatch.setattr(providers, "_SAMPLE_PATH", sample)
    monkeypatch.setenv("AJORA_PERSONA_PATH", str(secret))
    provider = FilePersonaProvider()
    assert provider.list_users() == ["u_demo", "u_private"]
    assert provider.get_batch("u_private").fx_rates_ngn == {"EUR": 1500.0}
    assert FilePersonaProvider(mock_dir=mock, sample_path=sample).list_users() == ["u_demo"]
    _write_batch(secret, user_id="u_demo")
    with pytest.raises(ValueError, match="Duplicate persona"):
        FilePersonaProvider()


def test_missing_configured_secret_persona_file_fails_clearly(tmp_path, monkeypatch):
    monkeypatch.setenv("AJORA_PERSONA_PATH", str(tmp_path / "missing.json"))
    with pytest.raises(FileNotFoundError, match="AJORA_PERSONA_PATH is not a file"):
        FilePersonaProvider()


def test_private_fx_is_consistent_across_cashflow_insights_and_consent(tmp_path, monkeypatch):
    path = tmp_path / "mock" / "persona_test.json"
    _write_batch(path)
    provider = FilePersonaProvider(mock_dir=path.parent, sample_path=tmp_path / "absent")
    monkeypatch.setitem(app.dependency_overrides, get_provider, lambda: provider)
    client = TestClient(app)
    url = "/users/u_private"
    raw = client.get(f"{url}/transactions").json()
    assert raw["transactions"][0]["currency"] == "EUR"
    cashflow = client.get(f"{url}/cashflow").json()
    assert cashflow["totals"]["gross_income"] == 16500
    assert cashflow["totals"]["net_income"] == 15000
    assert cashflow["totals"]["net_spending"] == 3000
    assert cashflow["matches"][0]["debit"]["currency"] == "EUR"
    insights = client.get(f"{url}/insights").json()["insights"]
    support, = [item for item in insights["insights"] if item["relationship_type"] == "dependent"]
    assert support["total_out_ngn"] == 3000
    assert support["pct_of_net_income"] == 20
    assert client.get(f"{url}/graph").is_success
    assert client.get(f"{url}/explanations").is_success
    assert client.post(f"{url}/accounts/ngn/revoke").is_success
    remaining = client.get(f"{url}/cashflow").json()
    assert remaining["totals"]["gross_income"] == 15000
    assert remaining["totals"]["gross_spending"] == 4500
    assert remaining["matches"] == []
    assert client.get(f"{url}/transactions").json()["transactions"][0]["currency"] == "EUR"


@pytest.mark.parametrize("rate", [0, -1, float("inf"), float("nan")])
def test_imported_valuation_rates_must_be_finite_and_positive(tmp_path, rate):
    raw = _write_batch(tmp_path / "persona_test.json", rates={"EUR": rate})
    with pytest.raises(ValidationError):
        TransactionBatch.model_validate(raw)


@pytest.mark.parametrize("debit_ref,credit_ref,expected", [
    (" abc123 ", "ABC123", 1),
    (" ", " ", 0),
    (None, None, 0),
])
def test_bare_bank_references_are_normalized_and_empty_values_do_not_match(
    tmp_path, debit_ref, credit_ref, expected,
):
    from engine.dedup.similarity import DedupConfig, extract_features

    batch = TransactionBatch.model_validate(_write_batch(tmp_path / "persona_test.json"))
    debit = batch.transactions[2].model_copy(update={"reference": debit_ref})
    credit = batch.transactions[3].model_copy(update={"reference": credit_ref})
    features = extract_features(debit, credit, batch.user, DedupConfig(fx_rates_ngn=batch.fx_rates_ngn))
    assert features.ref_match == expected

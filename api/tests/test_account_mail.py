"""Mail transport uses the configured app origin and never exposes provider details."""
import json

import httpx
import pytest

from api import account_mail as mail


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("AJORA_RESEND_API_KEY", "test-mail-secret")
    monkeypatch.setenv("AJORA_EMAIL_FROM", "Ajora <accounts@example.com>")
    monkeypatch.setenv("AJORA_PUBLIC_WEB_URL", "https://ajora.example")


@pytest.mark.parametrize("value", [
    "http://ajora.example", "https://user:secret@ajora.example", "https://ajora.example/path",
    "https://ajora.example?token=secret", "https://ajora.example#secret", "https://ajora.example:bad",
    "https://ajora.example\n.evil.example", "//ajora.example", "",
])
def test_bad_public_origin_disables_delivery(configured, monkeypatch, value):
    monkeypatch.setenv("AJORA_PUBLIC_WEB_URL", value)
    assert mail.delivery_available() is False


def test_missing_key_or_sender_and_header_injection_disable_delivery(configured, monkeypatch):
    monkeypatch.delenv("AJORA_RESEND_API_KEY")
    assert not mail.delivery_available()
    monkeypatch.setenv("AJORA_RESEND_API_KEY", "secret")
    monkeypatch.setenv("AJORA_EMAIL_FROM", "accounts@example.com\nBcc: victim@example.com")
    assert not mail.delivery_available()


@pytest.mark.parametrize("purpose,route", [("reset", "/reset-password"), ("verify", "/verify-email")])
def test_mail_has_fragment_token_and_no_redirect_following(configured, monkeypatch, purpose, route):
    sent = []
    def post(url, **kwargs):
        sent.append((url, kwargs))
        return httpx.Response(200, json={"id": "message-id"})
    monkeypatch.setattr(mail.httpx, "post", post)
    token = "a" * 43
    mail.send_account_email("member@example.com", purpose, token)
    url, kwargs = sent[0]
    assert url == "https://api.resend.com/emails"
    assert kwargs["follow_redirects"] is False
    assert kwargs["timeout"] == 10
    assert kwargs["json"]["to"] == ["member@example.com"]
    assert "https://ajora.example" + route + "#token=" + token in kwargs["json"]["text"]
    assert "?token=" not in json.dumps(kwargs["json"])
    assert token not in kwargs["headers"]["Idempotency-Key"]


@pytest.mark.parametrize("response", [
    httpx.Response(403, json={"message": "private provider error"}),
    httpx.Response(302, headers={"Location": "https://evil.example"}),
    httpx.Response(200, content="private malformed response"),
    httpx.Response(200, json=[]),
])
def test_provider_failures_are_sanitized(configured, monkeypatch, response):
    monkeypatch.setattr(mail.httpx, "post", lambda *args, **kwargs: response)
    with pytest.raises(mail.MailDeliveryError) as caught:
        mail.send_account_email("member@example.com", "reset", "x" * 43)
    assert "private" not in str(caught.value)
    assert "test-mail-secret" not in str(caught.value)


def test_network_failure_is_sanitized(configured, monkeypatch):
    def fail(*args, **kwargs):
        raise httpx.ConnectError("private provider error and test-mail-secret")
    monkeypatch.setattr(mail.httpx, "post", fail)
    with pytest.raises(mail.MailDeliveryError, match="temporarily unavailable"):
        mail.send_account_email("member@example.com", "verify", "x" * 43)


def test_password_changed_notice_contains_no_password_or_token(configured, monkeypatch):
    sent = []
    monkeypatch.setattr(mail.httpx, "post", lambda *args, **kwargs: sent.append(kwargs) or httpx.Response(200, json={"id": "notice"}))
    mail.send_password_changed_email("member@example.com")
    body = sent[0]["json"]
    assert "all devices have been signed out" in body["text"]
    assert "/forgot-password" in body["text"]
    assert "#token=" not in json.dumps(body)

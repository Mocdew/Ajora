"""Narration parsing helpers for the dedup stage.

Nigerian bank narrations are noisy and non-standard, e.g.:

    "TRF/STEPHEN VINCENT/Transfer to self GTB-KUDA/REF:100033445566"
    "NIP:ACCESS:TO KUDA MFB:STEPHEN O VINCENT:0987766554433"
    "Transfer from STEPHEN O VINCENT | Ref 100033445566"

We extract two things that drive matching:
  1. a cleaned counterparty-name string (bank/transfer noise and digits stripped), and
  2. candidate reference tokens (NIP session ids etc.) that, if shared across two
     legs, are near-certain evidence of the same transfer.

Single source of truth; `app.dedup.normalize` re-exports these. Pure (stdlib `re`
only) — no web/DB/network.
"""

from __future__ import annotations

import re

# Transfer plumbing and legal-entity words that carry no identity signal. Stripped
# before name comparison so "TRF TO STEPHEN VINCENT GTB" reduces to "STEPHEN VINCENT".
_NOISE_TOKENS: frozenset[str] = frozenset(
    {
        "TRF", "TRANSFER", "TRANSFERS", "TRANSFERED", "TRANSFERRED", "XFER",
        "TO", "FROM", "VIA", "FOR", "THE", "AND",
        "NIP", "NEFT", "RTGS", "USSD", "POS", "ATM", "WEB", "MOBILE", "APP", "ONLINE",
        "REF", "REFERENCE", "SESSION", "SESSIONID", "TXN", "TRX", "TRANS", "PAYMENT", "PMT",
        "SELF", "OWN", "ME", "INTERNAL", "WALLET", "FUND", "FUNDING", "TOPUP",
        "BANK", "MFB", "PLC", "LTD", "LIMITED", "NG", "NGN",
        # common Nigerian bank names / slugs seen inside narrations
        "GTB", "GTBANK", "GUARANTY", "TRUST", "ACCESS", "DIAMOND", "ZENITH", "UBA",
        "FIRSTBANK", "FBN", "FIDELITY", "UNION", "STERLING", "WEMA", "ALAT", "FCMB",
        "KUDA", "OPAY", "PALMPAY", "MONIEPOINT", "STANBIC", "IBTC", "ECOBANK", "POLARIS",
        "PROVIDUS", "KEYSTONE", "HERITAGE", "UNITY", "JAIZ", "TITAN",
    }
)

_REF_PREFIX_RE = re.compile(r"REF(?:ERENCE)?[:\s#.-]*([A-Za-z0-9]{5,})", re.IGNORECASE)
_LONG_DIGITS_RE = re.compile(r"\b\d{6,}\b")
_SEP_RE = re.compile(r"[\/|:;,._\-\\]+")
_NON_ALPHA_RE = re.compile(r"[^A-Z\s]")


def extract_references(text: str) -> set[str]:
    """Candidate reference / session-id tokens, normalized to uppercase.

    Picks up both explicit ``REF:...`` markers and bare long digit runs (NIP session
    ids). A reference shared by two legs is the strongest possible match signal.
    """
    if not text:
        return set()
    refs: set[str] = set()
    for m in _REF_PREFIX_RE.finditer(text):
        refs.add(m.group(1).upper())
    for m in _LONG_DIGITS_RE.finditer(text):
        refs.add(m.group(0))
    return refs


def clean_name(text: str, *, extra: str | None = None) -> str:
    """Reduce a narration (optionally plus a bank-supplied counterparty name) to the
    bare alphabetic name tokens, with transfer plumbing and digits removed.

    Returns an uppercased, single-spaced string suitable for fuzzy comparison. May be
    empty when the narration carries no name (e.g. "POS PURCHASE 123") — callers treat
    an empty result as "no name signal".
    """
    parts = [text or ""]
    if extra:
        parts.append(extra)
    joined = " ".join(parts).upper()
    joined = _SEP_RE.sub(" ", joined)
    joined = _NON_ALPHA_RE.sub(" ", joined)  # drop digits/punctuation left behind
    tokens = [t for t in joined.split() if len(t) >= 2 and t not in _NOISE_TOKENS]
    return " ".join(tokens)

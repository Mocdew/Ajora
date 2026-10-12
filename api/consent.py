"""Per-account consent — the trust layer's first half.

A :class:`ConsentRecord` is held per *connected account*: the user granted (or has
revoked) permission for that one account's data to flow into the pipeline. Revoking
an account stops its transactions reaching dedup/insights/graph *before* the engine
runs, so the honest-cashflow and communal numbers visibly change.

Durable state is an **append-only events file** (``consent.jsonl``), not a database —
the no-DB architecture in CLAUDE.md. Each line is a grant/revoke *event*; current
state is the fold of events in order. Seeding is lazy: the first time we see a user
with no events, every account in their data is recorded as ``granted``.

The store is behind the :class:`ConsentStore` interface so a real open-banking consent
store (one that calls Mono/Okra to actually sever the data link) can replace
:class:`FileConsentStore` with no route or service changes.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Mapping, Optional, Protocol, Set, runtime_checkable

from pydantic import BaseModel, Field

from engine.schemas.transaction import TransactionBatch, UserProfile

from .audit import AuditLog
from .providers import DataProvider

__all__ = [
    "ConsentStatus",
    "ConsentRecord",
    "ConsentStore",
    "FileConsentStore",
    "account_institutions",
    "consented_batch",
]

ConsentStatus = str  # one of "granted" | "revoked" (kept open for the Literal below)


class ConsentRecord(BaseModel):
    """Consent state for one connected account."""

    user_id: str
    account_id: str
    institution: str
    status: str = Field(..., description="'granted' or 'revoked'.")
    granted_at: datetime = Field(..., description="When consent was (most recently) granted.")
    revoked_at: Optional[datetime] = Field(
        default=None, description="When consent was revoked; None while granted."
    )


def _now() -> datetime:
    return datetime.now(timezone.utc)


def account_institutions(batch: TransactionBatch) -> Dict[str, str]:
    """Map every account in a batch to its institution slug.

    Accounts are drawn from both the transactions and the user's declared
    ``account_ids`` (an account with no transactions still gets a record). The
    institution comes from the transactions; an account seen only on the profile
    falls back to ``"unknown"``.
    """
    mapping: Dict[str, str] = {}
    for txn in batch.transactions:
        mapping.setdefault(txn.account_id, txn.institution)
    for account_id in batch.user.account_ids:
        mapping.setdefault(account_id, "unknown")
    return mapping


@runtime_checkable
class ConsentStore(Protocol):
    """Per-account consent state, durable and swappable.

    ``ensure_seeded`` is idempotent: it records every account as granted the first
    time a user is seen and does nothing thereafter.
    """

    def ensure_seeded(self, user_id: str, accounts: Mapping[str, str]) -> None: ...

    def knows_account(self, user_id: str, account_id: str) -> bool: ...

    def grant(self, user_id: str, account_id: str) -> ConsentRecord: ...

    def revoke(self, user_id: str, account_id: str) -> ConsentRecord: ...

    def records_for(self, user_id: str) -> List[ConsentRecord]: ...

    def revoked_accounts(self, user_id: str) -> Set[str]: ...


class FileConsentStore:
    """Consent store backed by an append-only ``consent.jsonl`` events file.

    Events (``{ts, user_id, account_id, institution, action}``) are appended, never
    rewritten; current state is the fold of all events on load. In-memory state is
    kept in sync as events are appended, so a running process never re-reads the file.
    """

    def __init__(self, path: Path) -> None:
        self._path = Path(path)
        # user_id -> account_id -> ConsentRecord (current folded state)
        self._state: Dict[str, Dict[str, ConsentRecord]] = {}
        self._load()

    # --- loading / folding ---------------------------------------------------------

    def _load(self) -> None:
        if not self._path.is_file():
            return
        with self._path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                self._apply(json.loads(line))

    def _apply(self, event: dict) -> None:
        user_id = event["user_id"]
        account_id = event["account_id"]
        institution = event.get("institution", "unknown")
        action = event["action"]
        ts = datetime.fromisoformat(event["ts"])
        users = self._state.setdefault(user_id, {})
        existing = users.get(account_id)
        if action == "grant":
            users[account_id] = ConsentRecord(
                user_id=user_id,
                account_id=account_id,
                institution=existing.institution if existing else institution,
                status="granted",
                granted_at=ts,
                revoked_at=None,
            )
        elif action == "revoke":
            base = existing or ConsentRecord(
                user_id=user_id,
                account_id=account_id,
                institution=institution,
                status="granted",
                granted_at=ts,
            )
            users[account_id] = base.model_copy(
                update={"status": "revoked", "revoked_at": ts}
            )

    def _append(self, user_id: str, account_id: str, institution: str, action: str) -> datetime:
        ts = _now()
        event = {
            "ts": ts.isoformat(),
            "user_id": user_id,
            "account_id": account_id,
            "institution": institution,
            "action": action,
        }
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(event, ensure_ascii=False) + "\n")
        self._apply(event)
        return ts

    # --- public API ----------------------------------------------------------------

    def ensure_seeded(self, user_id: str, accounts: Mapping[str, str]) -> None:
        if user_id in self._state:
            return
        # Record every known account as granted, in a stable order.
        for account_id in sorted(accounts):
            self._append(user_id, account_id, accounts[account_id], "grant")

    def knows_account(self, user_id: str, account_id: str) -> bool:
        return account_id in self._state.get(user_id, {})

    def grant(self, user_id: str, account_id: str) -> ConsentRecord:
        institution = self._institution(user_id, account_id)
        self._append(user_id, account_id, institution, "grant")
        return self._state[user_id][account_id]

    def revoke(self, user_id: str, account_id: str) -> ConsentRecord:
        institution = self._institution(user_id, account_id)
        self._append(user_id, account_id, institution, "revoke")
        return self._state[user_id][account_id]

    def records_for(self, user_id: str) -> List[ConsentRecord]:
        return [self._state[user_id][a] for a in sorted(self._state.get(user_id, {}))]

    def revoked_accounts(self, user_id: str) -> Set[str]:
        return {
            a for a, rec in self._state.get(user_id, {}).items() if rec.status == "revoked"
        }

    def _institution(self, user_id: str, account_id: str) -> str:
        rec = self._state.get(user_id, {}).get(account_id)
        return rec.institution if rec else "unknown"


def consented_batch(
    provider: DataProvider,
    consent_store: ConsentStore,
    audit_log: AuditLog,
    user_id: str,
    endpoint: Optional[str],
) -> TransactionBatch:
    """Load a user's batch, filter out revoked accounts, and audit the access.

    This is the single choke point every data endpoint loads through, so the trust
    layer lives in exactly one place:

    1. fetch the raw batch (raises :class:`~api.providers.UserNotFound` for a bad id),
    2. lazily seed consent (all accounts granted on first sight),
    3. drop transactions whose account is revoked and shrink ``user.account_ids``,
    4. write one append-only audit entry recording what was read vs withheld, unless
       ``endpoint`` is ``None`` for a validate-then-persist flow that audits on success.

    The engine then runs on a batch that already reflects consent, so a revoked
    account simply never reaches dedup/insights/graph.
    """
    batch = provider.get_batch(user_id)
    consent_store.ensure_seeded(user_id, account_institutions(batch))

    revoked = consent_store.revoked_accounts(user_id)

    all_accounts = {t.account_id for t in batch.transactions} | set(batch.user.account_ids)
    kept_transactions = [t for t in batch.transactions if t.account_id not in revoked]
    accounts_accessed = sorted({t.account_id for t in kept_transactions})
    revoked_excluded = sorted(revoked & all_accounts)

    if endpoint is not None:
        audit_log.record(
            user_id=user_id,
            endpoint=endpoint,
            accounts_accessed=accounts_accessed,
            revoked_excluded=revoked_excluded,
        )

    filtered_user = UserProfile(
        user_id=batch.user.user_id,
        full_name=batch.user.full_name,
        aliases=batch.user.aliases,
        account_ids=[a for a in batch.user.account_ids if a not in revoked],
    )
    return TransactionBatch(user=filtered_user, transactions=kept_transactions)

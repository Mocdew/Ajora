"""Ephemeral savings feed seam. The bundled provider is explicitly demo-only.

Fixture templates are instantiated independently of member claims. A future bank
provider must obtain its data server-side through authenticated account consent;
no endpoint accepts browser-supplied transactions as verified bank evidence.
"""
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Literal, Protocol

from pydantic import BaseModel, Field


class BankReceipt(BaseModel):
    id: str
    amount_kobo: int
    reference: str
    sender_name: str
    occurred_at: str


class MatchCandidate(BaseModel):
    payment_id: str
    transaction_id: str


class BankFeed(BaseModel):
    source: Literal["demo"] = "demo"
    account_id: str
    refreshed_at: str
    transactions: list[BankReceipt]
    matches: list[MatchCandidate] = Field(default_factory=list)
    notice: str = "Simulated bank feed. Matches demonstrate reconciliation and do not verify real payments."


class BankFeedProvider(Protocol):
    def get_feed(self, circle: dict) -> BankFeed: ...


class DemoBankFeedProvider:
    def get_feed(self, circle: dict) -> BankFeed:
        template = json.loads((Path(__file__).parent.parent / "data/mock/savings_feed.json").read_text())
        number = circle["current_round"]
        total = circle["contribution_kobo"]
        first = total * template["first_part_percent"] // 100
        parts = [(template["first_suffix"], first), (template["second_suffix"], total - first)] if first else [(template["second_suffix"], total)]
        transactions = []
        for member in circle["members"]:
            for suffix, amount in parts:
                reference = f"AJORA-{circle['id'][:8]}-{number}-{member['position']}-{suffix}"
                transactions.append(BankReceipt(id=f"demo:{circle['id']}:{number}:{member['user_id']}:{suffix}",
                    amount_kobo=amount, reference=reference, sender_name=member["display_name"],
                    occurred_at=f"{circle['due_dates'][number - 1]}T09:00:00+01:00"))
        return BankFeed(account_id=circle["collection_account"]["account_id"],
            refreshed_at=datetime.now(timezone.utc).isoformat(), transactions=transactions)


def get_bank_feed_provider() -> BankFeedProvider:
    return DemoBankFeedProvider()

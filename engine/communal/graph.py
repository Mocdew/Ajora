"""The communal relationship graph (NetworkX).

A directed multigraph of the user and the people they move money with. Edges are
individual transfers (user->counterparty for a debit, counterparty->user for a credit),
carrying amount/date/currency. Aggregated per-counterparty stats on top of it give the
classifier its *structural* signals — recurrence, reciprocity, lump-sum payouts — and
drive the relationship view in the UI.

Merchant/bill transactions are excluded: this graph is about relationships, not spending.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

import networkx as nx

from ..schemas.transaction import Transaction, UserProfile
from ..dedup.normalize import clean_name
from .lexicon import is_merchant_or_bill

# FX for NGN-normalized relationship volumes — kept consistent with the dedup engine's
# default (NGN per 1 unit of foreign currency). Non-exhaustive by design (demo).
FX_RATES_NGN: Dict[str, float] = {"USD": 1550.0, "GBP": 1950.0, "EUR": 1680.0}

_NONALPHA = re.compile(r"[^A-Z ]")
_WS = re.compile(r"\s+")

USER_NODE = "__user__"


def to_ngn(amount: float, currency: str) -> float:
    if currency == "NGN":
        return amount
    return amount * FX_RATES_NGN.get(currency.upper(), 1.0)


def counterparty_key(txn: Transaction) -> Optional[str]:
    """A stable identity for the person/entity on the other side of a transfer.

    Prefers the bank-supplied counterparty name; falls back to name tokens parsed from
    the narration. Returns None when nothing name-like can be resolved.
    """
    if txn.counterparty_name:
        key = _WS.sub(" ", _NONALPHA.sub(" ", txn.counterparty_name.upper())).strip()
        if key:
            return key
    fallback = clean_name(txn.narration)
    return fallback or None


@dataclass
class CounterpartyStats:
    name: str
    out_count: int = 0
    in_count: int = 0
    out_total_ngn: float = 0.0
    in_total_ngn: float = 0.0
    out_amounts_ngn: List[float] = field(default_factory=list)
    in_amounts_ngn: List[float] = field(default_factory=list)
    _months: Set[Tuple[int, int]] = field(default_factory=set)
    first_out_ts: Optional[object] = None

    @property
    def months_active(self) -> int:
        return len(self._months)

    @property
    def reciprocal(self) -> bool:
        return self.out_count > 0 and self.in_count > 0

    @property
    def avg_out_ngn(self) -> float:
        return self.out_total_ngn / self.out_count if self.out_count else 0.0


def build_relationship_graph(
    transactions: List[Transaction],
    user: UserProfile,
    skip_ids: Optional[Set[str]] = None,
) -> Tuple[nx.MultiDiGraph, Dict[str, CounterpartyStats]]:
    """Build the graph and per-counterparty aggregates over relationship transfers.

    `skip_ids` (e.g. the dedup stage's internal-transfer leg ids) and merchant/bill
    transactions are excluded.
    """
    skip = skip_ids or set()
    g = nx.MultiDiGraph()
    g.add_node(USER_NODE, kind="user", name=user.full_name)
    stats: Dict[str, CounterpartyStats] = {}

    for t in transactions:
        if t.id in skip:
            continue
        if is_merchant_or_bill(t.narration, t.counterparty_name):
            continue
        key = counterparty_key(t)
        if not key:
            continue
        amt_ngn = to_ngn(t.amount, t.currency)
        st = stats.get(key) or CounterpartyStats(name=key)
        stats[key] = st
        if key not in g:
            g.add_node(key, kind="counterparty", name=key)
        st._months.add((t.timestamp.year, t.timestamp.month))
        if t.direction == "debit":
            g.add_edge(USER_NODE, key, txn_id=t.id, amount_ngn=amt_ngn,
                       currency=t.currency, ts=t.timestamp)
            st.out_count += 1
            st.out_total_ngn += amt_ngn
            st.out_amounts_ngn.append(amt_ngn)
            if st.first_out_ts is None or t.timestamp < st.first_out_ts:
                st.first_out_ts = t.timestamp
        else:
            g.add_edge(key, USER_NODE, txn_id=t.id, amount_ngn=amt_ngn,
                       currency=t.currency, ts=t.timestamp)
            st.in_count += 1
            st.in_total_ngn += amt_ngn
            st.in_amounts_ngn.append(amt_ngn)

    return g, stats

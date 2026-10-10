"""Grouping & windowing helpers — pure data-shaping for the candidate-match stage.

The dedup engine's first stage looks for the far leg of a self-transfer: for an
outflow in one account, it needs the inflows in the user's *other* accounts that
fall within a short time window. These helpers do exactly that shaping — split a
transaction list by account/institution and slice it by time — and nothing more.
They assign no scores and decide no matches; scoring and Hungarian pairing stay in
the engine's later stages.

Everything here is a pure function over ``list[Transaction]`` with no I/O, no
network, and no DB — so ``engine`` stays import-pure. Returned lists preserve the
input order; grouping dicts preserve first-seen key order.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, List

from engine.models import Transaction, TransactionDirection

__all__ = [
    "group_by_account",
    "group_by_institution",
    "in_window",
    "window_around",
    "cross_account_candidates",
]


def group_by_account(transactions: List[Transaction]) -> Dict[str, List[Transaction]]:
    """Split transactions into ``{account_id: [transactions...]}``.

    Self-transfers are moves between the user's own accounts, so the candidate-match
    stage reasons per-account: an outflow from account A can only pair with an inflow
    in a *different* account.
    """
    grouped: Dict[str, List[Transaction]] = defaultdict(list)
    for txn in transactions:
        grouped[txn.account_id].append(txn)
    return dict(grouped)


def group_by_institution(transactions: List[Transaction]) -> Dict[str, List[Transaction]]:
    """Split transactions into ``{institution: [transactions...]}``.

    Dedup is *cross-institution* by definition — the phantom self-transfer exists
    because the two legs live at two different banks — so grouping by institution is
    a convenient way to confirm a candidate pair really spans two banks.
    """
    grouped: Dict[str, List[Transaction]] = defaultdict(list)
    for txn in transactions:
        grouped[txn.institution].append(txn)
    return dict(grouped)


def in_window(
    transactions: List[Transaction],
    start: datetime,
    end: datetime,
) -> List[Transaction]:
    """Return transactions whose ``timestamp`` falls in the closed interval ``[start, end]``.

    All canonical timestamps are UTC-aware (normalized in the model), so comparisons
    here are unambiguous as long as ``start``/``end`` are timezone-aware too.
    """
    return [txn for txn in transactions if start <= txn.timestamp <= end]


def window_around(
    transactions: List[Transaction],
    center: datetime,
    window: timedelta,
) -> List[Transaction]:
    """Return transactions within ``+/- window`` of ``center``.

    The candidate-match stage calls this with an outflow's timestamp as ``center``:
    the far leg of a genuine self-transfer settles close in time, so a small window
    bounds the search cheaply before any scoring happens.
    """
    return in_window(transactions, center - window, center + window)


def cross_account_candidates(
    source: Transaction,
    transactions: List[Transaction],
    window: timedelta,
) -> List[Transaction]:
    """Candidate far-legs for ``source``: opposite-direction transactions in a
    *different* account, within ``+/- window`` of ``source``'s timestamp.

    This is pure candidate *shaping* — it narrows the search space the way the
    candidate-match stage needs ("cross-account pairing within a window"). It does
    **not** score similarity or decide a match; that is the scoring + Hungarian
    stages' job. ``source`` itself is never returned.
    """
    opposite = (
        TransactionDirection.CREDIT
        if source.direction is TransactionDirection.DEBIT
        else TransactionDirection.DEBIT
    )
    lo, hi = source.timestamp - window, source.timestamp + window
    return [
        txn
        for txn in transactions
        if txn.id != source.id
        and txn.account_id != source.account_id
        and txn.direction is opposite
        and lo <= txn.timestamp <= hi
    ]

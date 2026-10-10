"""The *facts* layer — the single, explicit boundary between the engine's insight
objects and the prompt.

`build_facts` projects a structured insight object (today: `DedupResult`) into a small,
flat, JSON-serializable dict containing **only** the fields the prompt is allowed to
use. This is the heart of the grounding contract: if a value is not in the facts dict,
the explainer has no business mentioning it. Conversely, every number that may legally
appear in an explanation can be recovered from this dict — which is exactly what
`collect_allowed_numbers` does for the grounding check.

Design points:
- We build the dict **by hand**, field by field, rather than `model_dump()`-ing the
  insight object. That guarantees eval-only ground truth (`transfer_pair_id`,
  `communal_tag`) can never leak into the prompt even if a future schema change stops
  marking them `exclude=True`.
- Per-transaction identifiers, raw narration, running balances and account ids are
  deliberately omitted — the explanation talks about money and banks, not PII.
"""

from __future__ import annotations

from typing import Any, Dict, List, Set

from ..schemas.dedup import DedupResult
from ..schemas.transaction import UserProfile
from .grounding import extract_numbers


def _first_name(full_name: str) -> str:
    parts = [p for p in full_name.strip().split() if p]
    return parts[0] if parts else ""


def build_facts(result: DedupResult, user: UserProfile) -> Dict[str, Any]:
    """Project a dedup `DedupResult` into the grounded facts the prompt may use.

    The returned dict is the ONLY source of truth the explainer is permitted to draw
    on. It is intentionally small and flat so it is cheap to send and easy to audit.
    """
    t = result.totals

    transfers: List[Dict[str, Any]] = []
    institutions: Set[str] = set()
    for m in result.matches:
        institutions.add(m.debit.institution)
        institutions.add(m.credit.institution)
        transfers.append(
            {
                # `amount` is the money that actually landed on the other side.
                "amount": round(m.credit.amount, 2),
                "fee": round(m.fee, 2),
                "confidence_pct": round(m.score * 100),
                "tier": m.tier,
                "from_bank": m.debit.institution,
                "to_bank": m.credit.institution,
                "reasons": list(m.reasons),
            }
        )

    return {
        "currency": "NGN",
        "user_first_name": _first_name(user.full_name),
        "match_count": len(result.matches),
        "distinct_institutions": len(institutions),
        "unmatched_candidate_count": len(result.unmatched_transfer_candidates),
        "totals": {
            "gross_income": round(t.gross_income, 2),
            "gross_spending": round(t.gross_spending, 2),
            "transfer_volume": round(t.transfer_volume, 2),
            "net_income": round(t.net_income, 2),
            "net_spending": round(t.net_spending, 2),
            "income_inflation_pct": round(t.income_inflation_pct, 1),
            "spending_inflation_pct": round(t.spending_inflation_pct, 1),
        },
        "transfers": transfers,
    }


def _walk_numbers(value: Any, acc: Set[float]) -> None:
    if isinstance(value, bool):
        # bool is an int subclass; a flag is not a spendable figure.
        return
    if isinstance(value, (int, float)):
        acc.add(round(float(value), 2))
        # Scores/counts are often spoken as percentages or multiples; allow the common
        # human renderings so a legitimate "98%" or "2 banks" is not flagged.
        return
    if isinstance(value, str):
        # Numbers embedded in human-readable strings we hand the model (e.g. a reason
        # like "Amount matches net of ~200 fee") are fair game to quote.
        for n in extract_numbers(value):
            acc.add(round(float(n), 2))
        return
    if isinstance(value, dict):
        for v in value.values():
            _walk_numbers(v, acc)
        return
    if isinstance(value, (list, tuple)):
        for v in value:
            _walk_numbers(v, acc)
        return


def collect_allowed_numbers(facts: Dict[str, Any]) -> Set[float]:
    """Every number that may legitimately appear in an explanation of `facts`.

    Walks the facts dict (including numbers embedded in human-readable strings) and
    returns the set of allowed magnitudes, rounded to 2dp. The grounding check treats
    any number in an explanation that is NOT in this set as a hallucination.
    """
    acc: Set[float] = set()
    _walk_numbers(facts, acc)
    return acc

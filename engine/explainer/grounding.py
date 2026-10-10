"""Grounding verification — the guardrail that makes "never hallucinate a number" an
enforced property rather than a hope.

Two independent checks:
  1. `verify_grounded` — every number in the explanation must be traceable to a number
     in the input facts (within a small tolerance). Any number that is not is reported
     as ungrounded.
  2. `check_no_forbidden_terms` — the explanation must not contain forbidden strings
     (used to assert that eval-only ground-truth vocabulary — communal tags, pair ids —
     never leaks into user-facing text).

Both run as production guardrails inside `Explainer`, and as assertions in the eval
harness. They treat the model's output as untrusted text.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, List, Sequence, Set

# A run of digits with optional thousands separators and an optional decimal part.
# We strip commas before parsing; a trailing "%" is simply not captured, so "38%"
# yields 38.0.
_NUMBER_RE = re.compile(r"(?<![\w.])\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?")


def extract_numbers(text: str) -> List[float]:
    """Pull every numeric magnitude out of free text, as floats.

    "₦1,250,000.00 is 38% of ..." -> [1250000.0, 38.0]. Commas are stripped; a leading
    currency symbol or trailing percent sign are ignored.
    """
    out: List[float] = []
    for tok in _NUMBER_RE.findall(text):
        cleaned = tok.replace(",", "")
        try:
            out.append(float(cleaned))
        except ValueError:
            continue
    return out


@dataclass
class GroundingReport:
    """Result of verifying one explanation against its facts."""

    grounded: bool
    ungrounded_numbers: List[float] = field(default_factory=list)
    forbidden_hits: List[str] = field(default_factory=list)
    numbers_checked: int = 0

    @property
    def ok(self) -> bool:
        return self.grounded and not self.forbidden_hits

    def summary(self) -> str:
        if self.ok:
            return f"grounded ({self.numbers_checked} numbers, all traceable)"
        bits = []
        if self.ungrounded_numbers:
            bits.append(f"ungrounded numbers: {self.ungrounded_numbers}")
        if self.forbidden_hits:
            bits.append(f"forbidden terms: {self.forbidden_hits}")
        return "; ".join(bits)


def _is_allowed(n: float, allowed: Set[float], tol: float) -> bool:
    return any(abs(n - a) <= tol for a in allowed)


def check_no_forbidden_terms(text: str, forbidden: Iterable[str]) -> List[str]:
    """Return any forbidden term that appears in `text` (case-insensitive)."""
    low = text.lower()
    return [term for term in forbidden if term.lower() in low]


def verify_grounded(
    text: str,
    allowed_numbers: Set[float],
    forbidden_terms: Sequence[str] = (),
    tol: float = 0.01,
) -> GroundingReport:
    """Check that `text` only cites numbers present in `allowed_numbers` and contains no
    `forbidden_terms`.

    `tol` absorbs rounding/formatting noise. Counts and percentages must already be in
    `allowed_numbers` (see `facts.collect_allowed_numbers`).
    """
    numbers = extract_numbers(text)
    ungrounded = [n for n in numbers if not _is_allowed(n, allowed_numbers, tol)]
    forbidden_hits = check_no_forbidden_terms(text, forbidden_terms)
    return GroundingReport(
        grounded=not ungrounded,
        ungrounded_numbers=ungrounded,
        forbidden_hits=forbidden_hits,
        numbers_checked=len(numbers),
    )

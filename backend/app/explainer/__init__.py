"""GenAI explainer — turns Ajora's *already-computed* structured insight objects
into clear, trustworthy natural-language explanations.

Hard rule of this package: **Claude explains numbers, it never computes them.** The
engine (stage-1 dedup, and later the communal-finance classifier) owns every figure;
the explainer may only restate figures that are present in the structured insight
object it is handed. See ``GROUNDING.md`` for the full grounding contract.

Nothing here is stateful and nothing here touches a database — it is a pure function
from an insight object to an explanation (plus a grounding report), per the
no-database architecture in ``CLAUDE.md``.
"""

from __future__ import annotations

from .client import AnthropicExplainerClient, ExplainerClient, StubExplainerClient
from .explainer import DEFAULT_MODEL, Explainer, ExplanationResult, UngroundedExplanation
from .facts import build_facts, collect_allowed_numbers
from .grounding import GroundingReport, extract_numbers, verify_grounded
from .prompt import SYSTEM_PROMPT, build_user_prompt

__all__ = [
    "AnthropicExplainerClient",
    "ExplainerClient",
    "StubExplainerClient",
    "DEFAULT_MODEL",
    "Explainer",
    "ExplanationResult",
    "UngroundedExplanation",
    "build_facts",
    "collect_allowed_numbers",
    "GroundingReport",
    "extract_numbers",
    "verify_grounded",
    "SYSTEM_PROMPT",
    "build_user_prompt",
]

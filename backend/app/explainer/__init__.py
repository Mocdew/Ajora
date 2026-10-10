"""Re-export shim — the grounded explainer now lives in ``engine.explainer``.

Kept so historical ``app.explainer`` import paths (tests, scripts) keep resolving,
exactly like the ``app.dedup`` / ``app.schemas`` shims. Importing any ``app.*``
module runs ``app/__init__`` first, which puts the repo root on ``sys.path`` so
``engine`` is importable.
"""

from __future__ import annotations

import app as _app  # noqa: F401  (ensures the repo root is on sys.path for `engine`)

from engine.explainer import (  # noqa: F401
    AnthropicExplainerClient,
    DEFAULT_MODEL,
    Explainer,
    ExplainerClient,
    ExplanationResult,
    GroundingReport,
    StubExplainerClient,
    SYSTEM_PROMPT,
    UngroundedExplanation,
    build_facts,
    build_user_prompt,
    collect_allowed_numbers,
    extract_numbers,
    verify_grounded,
)

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

"""Re-export shim — grounding now lives in ``engine.explainer.grounding``."""

from __future__ import annotations

import app as _app  # noqa: F401  (repo root on sys.path for `engine`)

from engine.explainer.grounding import *  # noqa: F401,F403
from engine.explainer.grounding import (  # noqa: F401
    GroundingReport,
    extract_numbers,
    verify_grounded,
)

"""Re-export shim — the explainer eval harness now lives in ``engine.explainer.eval``."""

from __future__ import annotations

import app as _app  # noqa: F401  (repo root on sys.path for `engine`)

from engine.explainer.eval import *  # noqa: F401,F403
from engine.explainer.eval import golden_cases, main, run_eval  # noqa: F401

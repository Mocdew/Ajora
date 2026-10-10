"""Ajora backend application package.

The dedup/classification logic itself lives in the top-level ``engine`` package
(the single source of truth). Everything under ``app.dedup`` / ``app.schemas`` is a
thin re-export shim over ``engine.*`` so historical import paths keep resolving.

``engine`` sits at the repo root, one level above ``backend/``. Under pytest it is
already importable (the root pyproject's ``pythonpath = ["."]``), but plain runs such
as ``python -m scripts.run_dedup_demo`` (cwd = ``backend/``) do not get that, so we
make the repo root importable here — importing *any* ``app.*`` module runs this first.
Idempotent and dependency-free.
"""

from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_REPO_ROOT = _Path(__file__).resolve().parent.parent.parent
if str(_REPO_ROOT) not in _sys.path:
    _sys.path.insert(0, str(_REPO_ROOT))

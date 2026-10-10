"""Run the explainer eval harness and print a human-readable report.

    cd backend
    ../.venv/bin/python -m scripts.run_explainer_eval

Runs fully offline against the deterministic stub. If ANTHROPIC_API_KEY and the
`anthropic` SDK are available, it also runs the golden cases through the live model and
prints that (informational) result. Exit code is non-zero iff the offline suite fails,
so it is CI-friendly.
"""

from __future__ import annotations

from app.explainer.eval import main

if __name__ == "__main__":
    raise SystemExit(main())

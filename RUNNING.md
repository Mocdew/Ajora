# Running Ajora (native, no Docker)

The demo runs as two local processes — the FastAPI engine and the Next.js dashboard.
No containers and no secrets are required: with no `ANTHROPIC_API_KEY` set, the GenAI
explainer uses a grounded offline stub.

> Docker (BUILD_PROMPTS Phase 6) was intentionally skipped — we run the stack natively
> for the demo. The code is container-ready if that changes later (stateless, file-backed,
> ports configurable), but there are no Dockerfiles committed.

## Prerequisites

- Python deps are in the repo-root `.venv` (created already). It must contain `fastapi`,
  `uvicorn`, and the engine libs (`scipy`, `rapidfuzz`, `scikit-learn`, `numpy`,
  `networkx`, `pydantic`) — all pinned in `backend/requirements.txt`.
- Node 18+ for the frontend. First time only: `npm --prefix web install`.

## 1. Backend — FastAPI engine (port 8000)

From the repo root:

```bash
.venv/bin/python -m uvicorn api.main:app --reload
```

Or launch **`ajora-api`** from the app's run UI (`.claude/launch.json`). Verify:

```bash
curl -s http://localhost:8000/health        # {"status":"ok","users":[...]}
```

Interactive API docs: http://localhost:8000/docs

## 2. Frontend — Next.js dashboard (port 3000)

In a second terminal. Use the live flag so the dashboard reads the real engine instead of
the local stubs:

```bash
NEXT_PUBLIC_USE_LIVE_API=1 npm --prefix web run dev
```

Or launch **`ajora-web`** from the run UI (set `NEXT_PUBLIC_USE_LIVE_API=1` in the env for
a fully-live run). The browser calls the backend through the same-origin `/api/engine`
proxy (Next rewrites to `AJORA_API_BASE`, default `http://localhost:8000`), so there are
no CORS concerns.

Open **http://localhost:3000**.

## 3. Demo

- Demo persona: **Emeka Balogun (`u_persona_b`)** — see the demo script in
  [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).
- Other personas: `u_persona_a` (biggest dedup inflation, no communal insights),
  `u_persona_c` (richest communal mix), `u_demo_stephen` (small sample).

## Notes

- **Ports:** backend defaults to `:8000` (`--port 8001` to change; then set
  `AJORA_API_BASE` for the frontend). Frontend defaults to `:3000`.
- **Stub vs live:** without `NEXT_PUBLIC_USE_LIVE_API=1` the dashboard renders local stubs
  that are byte-identical to real engine output — visually the same, but not exercising the
  backend. Use the flag for a true end-to-end demo.
- **Durable state:** `consent.jsonl` and `audit.jsonl` are written at the repo root at
  runtime (git-ignored). Revoking an account persists across restarts; delete these files
  to reset consent/audit to a clean slate before the demo.
- **Reset demo state:** `rm -f consent.jsonl audit.jsonl`.
```

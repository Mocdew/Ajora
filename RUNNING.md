# Running Ajora

The demo runs as two local processes — the FastAPI engine and the Next.js dashboard.
No secrets are required: with no `ANTHROPIC_API_KEY` set, the GenAI explainer uses a
grounded offline stub.

> **Docker alternative:** `docker compose up --build` from the repo root builds both
> services (`Dockerfile.api`, `web/Dockerfile`, `docker-compose.yml`) and serves the
> dashboard at **http://localhost:3000** (API on :8000). Consent/audit state lives inside
> the api container and resets on each `compose up`. The rest of this page covers the
> native run.

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

## 2. Frontend — Next.js dashboard (port 3100)

In a second terminal. The dashboard reads the real engine by default — no flag needed:

```bash
npm --prefix web run dev
```

`npm run dev` is pinned to **port 3100** (see `web/package.json`). Or launch **`ajora-web`**
from the run UI. The browser calls the backend through the same-origin `/api/engine` proxy
(Next rewrites to `AJORA_API_BASE`, default `http://localhost:8000`), so there are no CORS
concerns regardless of the frontend port.

Open **http://localhost:3100**.

## 3. Demo

- Demo persona: **Emeka Balogun (`u_persona_b`)** — see the demo script in
  [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).
- Other personas: `u_persona_a` (biggest dedup inflation, no communal insights),
  `u_persona_c` (richest communal mix), `u_demo_stephen` (small sample).

## Notes

- **Ports:** backend defaults to `:8000` (`--port 8001` to change; then set
  `AJORA_API_BASE` for the frontend). Frontend runs on **`:3100`** (pinned in
  `web/package.json`; override with `npm --prefix web run dev -- -p <port>`).
- **Live by default:** the dashboard, communal, audit and settings screens all read the
  real engine through the `/api/engine` proxy — no feature flag. (The old
  `NEXT_PUBLIC_USE_LIVE_API` switch is retired.)
- **Durable state:** `consent.jsonl` and `audit.jsonl` are written at the repo root at
  runtime (git-ignored). Revoking an account persists across restarts; delete these files
  to reset consent/audit to a clean slate before the demo.
- **Reset demo state:** `rm -f consent.jsonl audit.jsonl`.
```

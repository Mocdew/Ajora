# Running Ajora

The demo runs as two local processes — the FastAPI engine and the Next.js dashboard.
No secrets are required: with no `ANTHROPIC_API_KEY` set, the GenAI explainer uses a
grounded offline stub.

> **Docker alternative:** `docker compose up --build` from the repo root builds both
> services (`Dockerfile.api`, `web/Dockerfile`, `docker-compose.yml`) and serves the
> dashboard at **http://localhost:3000** (API on :8000). Consent/audit state lives inside
> the api container and survives container restarts; it resets when the container is removed/recreated. The rest of this page covers the
> native run.

## Prerequisites

- Python deps are in the repo-root `.venv` (created already). It must contain `fastapi`,
  `uvicorn`, and the engine libs (`scipy`, `rapidfuzz`, `scikit-learn`, `numpy`,
  `networkx`, `pydantic`) — declared in `backend/requirements.txt`.
- Node 22+ for the frontend. First time only: `npm --prefix web install`.

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
- **Isolated rehearsal:** set `AJORA_STATE_DIR` to a fresh temporary directory before starting the API. This preserves existing consent, audit, and correction files. Re-grant accounts through Settings to reset a regular demo.

## Verification

Run `.venv/bin/python -m pytest -q`, both engine harnesses, and `npm --prefix web run lint` / `npm --prefix web run build`. The CI workflow repeats these checks.

The hackathon demo uses deterministic offline narration when `ANTHROPIC_API_KEY` is unset. This is templated narration of engine output, not a live model call. The current optional live client is Anthropic; the Tensor provider in the project brief remains a separate integration.

### Browser walkthrough

Start a dedicated API against temporary state, with `AJORA_EXPLAINER=offline`, and build/start the web app pointing `AJORA_API_BASE` at that API. Then run:

```bash
npm --prefix web exec playwright install chromium
AJORA_TEST_BASE_URL=http://127.0.0.1:3100 npm --prefix web run test:e2e
```

An installed Chromium/Chrome can be selected with `AJORA_CHROME_PATH`. The test uses the real API and browser: it switches raw/true cashflow, rejects and confirms a transfer across reloads, revokes the domiciliary account, checks refreshed narration and communal insights, exports the audit log, and restores consent. It writes audit/consent/correction events, so use a dedicated `AJORA_STATE_DIR` rather than normal demo state. The CI workflow starts this isolated stack automatically.

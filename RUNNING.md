# Running Ajora

Ajora runs as two local processes: the FastAPI savings API and the Next.js app.
No banking or AI credentials are needed for the circle workflow. Payments are
tracked after being made outside Ajora; no money moves through the app.

> **Docker alternative:** `docker compose up --build` from the repo root builds both
> services (`Dockerfile.api`, `web/Dockerfile`, `docker-compose.yml`) and serves the
> app at **http://localhost:3000** (API on :8000). The included Compose setup
> stores `AJORA_STATE_DIR=/data` in the named `api-state` volume, retaining records
> across container replacement. Removing that volume (for example with
> `docker compose down -v`) removes the saved records. The rest of this page covers
> the native run.

## Prerequisites

- Python deps are in the repo-root `.venv` (created already). It must contain `fastapi`,
  `uvicorn`, and the engine libs (`scipy`, `rapidfuzz`, `scikit-learn`, `numpy`,
  `networkx`, `pydantic`) — declared in `backend/requirements.txt`.
- Node 22+ for the frontend. First time only: `npm --prefix web install`.

## 1. Backend — FastAPI API (port 8000)

From the repo root:

```bash
.venv/bin/python -m uvicorn api.main:app --reload
```

Or launch **`ajora-api`** from the app's run UI (`.claude/launch.json`). Verify:

```bash
curl -s http://localhost:8000/health        # {"status":"ok","users":[...]}
```

Interactive API docs: http://localhost:8000/docs

## 2. Frontend — Next.js app (port 3100)

In a second terminal:

```bash
npm --prefix web run dev
```

`npm run dev` is pinned to **port 3100** (see `web/package.json`). Or launch **`ajora-web`**
from the run UI. The browser calls the backend through the same-origin `/api/engine` proxy
(Next rewrites to `AJORA_API_BASE`, default `http://localhost:8000`), so there are no CORS
concerns regardless of the frontend port.

Open **http://localhost:3100**.

## 3. Savings-circle walkthrough

1. Open the app and enter a display name. Ajora creates a browser-bound identity
   using an HttpOnly cookie that expires after 30 days. This MVP has no production
   login or account recovery; expired or cleared cookies lose access to that identity.
2. Open **My Circles**, create a circle, and set its contribution amount, frequency,
   member limit, start date, and rules.
3. Copy the invite code. In another browser or browser profile, enter a different
   display name, preview the circle rules using that code, and confirm joining.
   Tabs in one browser share an identity.
4. Back as the organiser, arrange payout turns. Once every place is filled, start
   the circle. Membership and payout order are locked for this cycle.
5. Each member makes their contribution outside Ajora and submits its reference.
   The organiser checks receipt before confirming each contribution. If a claim
   is incorrect, reject it with a reason so the member can correct and resubmit it.
6. When all contributions for the round are confirmed, make the payout outside
   Ajora and record its reference. The circle advances to the next payout turn.
7. Inspect Home and Activity, then reload to verify the records remain available.

The legacy analytics demonstration is separate: Settings links to **Insights**
(`/insights`), transfer review (`/transfers`), communal insights (`/communal`), and
access history (`/audit`). Its persona switcher selects sample bank data, not a
savings-circle identity. See [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) for the
original analytics walkthrough.

## Notes

- **Ports:** backend defaults to `:8000` (`--port 8001` to change; then set
  `AJORA_API_BASE` for the frontend). Frontend runs on **`:3100`** (pinned in
  `web/package.json`; override with `npm --prefix web run dev -- -p <port>`).
- **Durable savings state:** SQLite stores circle identities, membership, contributions,
  and payout records at `AJORA_STATE_DIR/savings.sqlite3`. The default directory is
  the repository root. Set a persistent directory before starting the API; do not
  delete it to reset a demonstration that contains records you need.
- **Analytics state:** `consent.jsonl`, `audit.jsonl`, and `corrections.jsonl` share the
  state directory. Raw imported bank transactions are processed ephemerally.
- **Isolated rehearsal:** set `AJORA_STATE_DIR` to a fresh temporary directory before
  starting the API. This preserves existing records. A new state directory requires
  a new browser identity; use a fresh browser profile alongside it.

## Verification

Run `.venv/bin/python -m pytest -q`, both engine harnesses, and `npm --prefix web run lint` / `npm --prefix web run build`. The CI workflow repeats these checks.

The hackathon demo uses deterministic offline narration when `ANTHROPIC_API_KEY` is unset. This is templated narration of engine output, not a live model call. The current optional live client is Anthropic; the Tensor provider in the project brief remains a separate integration.

### Browser walkthrough

Start a dedicated API against temporary state, with `AJORA_EXPLAINER=offline`, and build/start the web app pointing `AJORA_API_BASE` at that API. Then run:

```bash
npm --prefix web exec playwright install chromium
AJORA_TEST_BASE_URL=http://127.0.0.1:3100 npm --prefix web run test:e2e
```

An installed Chromium/Chrome can be selected with `AJORA_CHROME_PATH`. The browser suite exercises the savings journey and the retained analytics
walkthrough against the real API. Savings tests use separate browser identities
for circle members. These tests write runtime records, so use a dedicated
`AJORA_STATE_DIR` rather than normal demo state. The CI workflow starts an isolated
stack automatically.

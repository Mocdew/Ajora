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

1. Open the app and enter a display name. In **Account access**, generate a recovery
   key and save it privately. You can use it to recover the same membership on a
   different device or after the 30-day browser session expires. Recovery signs out
   previous sessions; replacing a key invalidates the old key.
2. Open **My Circles**, create a two-member circle, and set its amount, frequency,
   start date and rules. Configure the labelled demo collection account if you want
   to rehearse bank-feed matching.
3. Share the invite code with a second browser profile. Create another identity,
   preview the rules and join. Tabs in one browser share an identity.
4. As the organiser, arrange payout turns. Each member accepts the final agreement.
   Changing membership, payout order or the collection account requires acceptance
   of the new version. Start once all places are filled and all members have accepted.
5. Submit contributions with references and actual instalment amounts. For the demo
   matching path, use the references and amounts shown in the demo bank feed; submit
   two instalments to exercise a partial contribution. The organiser reviews matches
   before approving them. For real externally made payments, use manual confirmation
   after checking receipt outside Ajora. A submitted reference alone is not proof.
6. Once every member has met the round's contribution, make the external payout and
   record its reference. The recipient confirms receipt or reports a discrepancy.
   Recording a payout does not advance the round; recipient confirmation does.
7. Inspect the circle history and Activity. Use refresh to fetch the latest shared
   state; open circle views also refresh periodically. WhatsApp actions prepare text
   for you to review and send yourself.
8. In a fresh browser, choose recovery and enter the saved key. Confirm that the
   existing circles and membership remain available.

The demo feed simulates receipts; **a demo match does not verify a real bank
payment**. No live Mono connection is configured. Raw feed data is processed in
memory; circle records retain only the payment evidence needed for the ledger.

The legacy analytics demonstration is separate: Settings links to **Insights**
(`/insights`), transfer review (`/transfers`), communal insights (`/communal`), and
access history (`/audit`). Its persona switcher selects sample bank data, not a
savings-circle identity. See [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) for the
original analytics walkthrough.

## Notes

- **Ports:** backend defaults to `:8000` (`--port 8001` to change; then set
  `AJORA_API_BASE` for the frontend). Frontend runs on **`:3100`** (pinned in
  `web/package.json`; override with `npm --prefix web run dev -- -p <port>`).
- **Durable savings state:** SQLite stores circle identities, recovery-key hashes,
  agreements, contributions, receipt allocations, event history and payout records at `AJORA_STATE_DIR/savings.sqlite3`. The default directory is
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

# Ajora

**Run your ajo or esusu circle with clear contributions, agreed turns, and a shared record.**

Ajora helps Nigerian savings circles keep track of money sent through their
existing bank accounts. Organisers can see what each member has contributed,
review instalments, and record payouts. Members can check the same history and
confirm when their payout arrives.

Built for Zecathon 2025 by Team P4L.

## Why Ajora

A rotating savings circle depends on people agreeing when to contribute and who
collects next. When references, receipts, and payout updates are scattered across
chats and spreadsheets, the organiser has to piece the record together.

Ajora brings that record into one place while your group continues making payments
through its usual channels. The MVP focuses on existing circles of people who
already know each other.

## What you can do

| Circle workflow | What Ajora records |
| --- | --- |
| Create and invite | Contribution amount, weekly or monthly schedule, rules, members, and payout order. |
| Agree before starting | Each member accepts the current agreement. Membership, order, or collection-account changes require fresh acceptance. |
| Contribute in instalments | Each payment has its own amount, reference, and review status. Totals use accepted amounts. |
| Reconcile contributions | Organisers confirm external receipts manually or approve exact reference-and-amount matches from the demo feed. A matched receipt cannot fund two payments. |
| Confirm payouts | An organiser reports a payout as sent. Its recipient confirms receipt or reports a problem; only receipt confirmation advances the round. |
| Keep the shared history | Agreement snapshots, payment decisions, corrections, and payout discrepancies remain visible. |
| Return and stay informed | Private recovery keys restore membership; polling and refresh show updates. WhatsApp actions prepare invitations, reminders, and summaries for you to send. |

**Current status:** Ajora is a working MVP with a simulated bank feed. Demo matches
exercise reconciliation; they do not verify real bank payments. Live Mono
integration is not implemented. Ajora does not collect, hold, or transfer money.
Payment discrepancy flags add to the shared history; they do not automatically
freeze payouts or resolve disputes.

## Quick start

Python 3.11+ and Node.js 22+ are the recommended local setup. Run these commands
from the repository root. You do not need bank credentials or an AI API key for
the savings-circle flow.

Install the backend and frontend dependencies:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm --prefix web ci
```

Start the API:

```bash
.venv/bin/python -m uvicorn api.main:app --reload
```

In a second terminal, start the frontend:

```bash
npm --prefix web run dev
```

Open [Ajora at localhost:3100](http://localhost:3100). The API runs on port 8000;
its [interactive reference](http://localhost:8000/docs) documents the endpoints.
The frontend proxies API calls through the same origin.

With Docker Compose, you can instead run:

```bash
docker compose up --build
```

The containerised app opens at [localhost:3000](http://localhost:3000). Compose
retains savings state in the `api-state` volume.

### Try a complete circle

1. Create a profile and save a private recovery key under **Account access**.
2. Create a two-member circle. Configure the demo collection account to try matching.
3. Use a second browser profile to join with the invite code. Tabs in one browser share an identity.
4. Arrange payout turns, have both members accept the final agreement, and start.
5. Submit instalments using the demo feed's references and amounts, then approve the matches as organiser. For real external payments, check receipt outside Ajora before confirming manually.
6. Record a payout as sent. As its recipient, confirm receipt to advance the round.

See [the full walkthrough](RUNNING.md) for recovery, discrepancy reporting,
configuration, and browser tests.

## Data and access

Circle records survive restarts in `AJORA_STATE_DIR/savings.sqlite3`. SQLite stores
membership, agreements, contributions, receipt allocations, payout records,
recovery-key hashes, and the shared event history. No database server is required.
The state directory defaults to the repository root; use a persistent volume and
back it up when deploying. Removing the Compose volume removes its saved records.

A profile uses a 30-day HttpOnly session cookie. Generate and privately save a
recovery key before changing devices or clearing cookies. Only its hash is stored;
replacing the key invalidates the old one, and recovery signs out previous
sessions. Anyone with the key can access that profile. Display names are not
verified bank identities.

Raw bank feeds are processed in memory and are not retained as transaction
histories. The circle ledger retains the payment evidence needed for its records.
Analytics consent, access, and correction events use append-only JSONL files.
Circle event history is append-only through the application; these records are not
cryptographic proof against tampering.

## For developers

- **Web:** Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, and TanStack Query over OpenAPI-generated types.
- **API:** FastAPI and Pydantic v2, with standard-library SQLite for savings state.
- **Analytics:** SciPy, RapidFuzz, scikit-learn, and NetworkX; file-backed persona fixtures keep the demo independent of live banks.

```text
api/               Savings API, recovery, demo feed, and analytics endpoints
web/               Next.js app and Playwright walkthroughs
engine/            Stateless transfer deduplication, classification, and explanations
data/              Demo fixtures and locally supplied private personas
scripts/           Dataset generation and evaluation tools
docs/              Demo guides, technical decisions, pitch files, and archives
requirements.txt   Python API, analytics, and test dependencies
```

The original financial-insights engine remains available through Settings. It
provides transfer deduplication, communal-finance classification, a relationship
graph, and explanations grounded in computed figures. Its sample personas are
separate from circle memberships. See the [analytics demo](docs/DEMO_SCRIPT.md)
and [API reference](api/README.md). Explanations run offline by default without
credentials; the optional live client uses Anthropic.

### Checks

Run the Python suite and frontend checks from the repository root:

```bash
.venv/bin/python -m pytest -q
npm --prefix web run lint
npm --prefix web run build
```

For analytics evaluation:

```bash
.venv/bin/python -m engine.harness
.venv/bin/python -m engine.communal_harness
.venv/bin/python -m scripts.run_explainer_eval
```

Follow [RUNNING.md](RUNNING.md#browser-walkthrough) to run the browser suite against
an isolated API state directory. [api/README.md](api/README.md) covers endpoint
contracts, configuration, and regeneration of frontend types.

Original presentation files live in [docs/pitch](docs/pitch/). Earlier build prompts
are preserved as [archived project history](docs/archive/BUILD_PROMPTS.md).

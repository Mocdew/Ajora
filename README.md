# Ajora

**Ajo and esusu savings circles, with clear contributions and payout turns.**
Zecathon 2025 — Team P4L.

Ajora helps members organise a rotating savings circle and keep a shared record of
who has contributed and whose turn it is to collect.

1. **Create or join a circle** with an invite code, contribution amount, weekly or
   monthly schedule, membership limit, start date, and agreed rules.
2. **Agree the payout order** while the circle is forming. The organiser starts a
   full circle, locking membership and payout turns for the cycle.
3. **Track contributions** through submitted and organiser-confirmed statuses.
   Organisers can reject an incorrect claim with a reason so the member can resubmit.
4. **Record payouts** after every contribution for the current round is confirmed;
   advance through each member's turn until the cycle is complete.
5. **Follow your savings** from Home, My Circles, and Activity.

This MVP records **payments made outside Ajora**. A submitted reference is a claim,
not automatic payment verification. Organisers confirm receipt and record external
payouts. Ajora does not collect, hold, or disburse money, and no live bank integration
is implemented.

A display name creates a browser-bound identity using an HttpOnly session cookie.
The cookie lasts 30 days. This is a demonstration identity, without production
account login or recovery. Use
separate browsers or browser profiles to act as different members.

## Architecture: durable circles, ephemeral bank analytics

No database server is required. The savings service uses the sanctioned SQLite
fallback because circle membership, obligations, and payment records must survive
restarts. `AJORA_STATE_DIR/savings.sqlite3` stores this state; the default state
directory is the repository root. Keep the state directory on a persistent volume
when deploying.

Raw imported bank transactions remain ephemeral: the separate analytics engine
loads, normalizes, deduplicates, and classifies them in memory. Existing
`audit.jsonl`, `consent.jsonl`, and `corrections.jsonl` files retain analytics access,
consent, and feedback records. Runtime state is not source data to commit.

## Supporting financial insights

The existing cross-bank transfer deduplication, communal-finance classification,
relationship graph, and grounded explanations remain available as secondary
analytics, reached from Settings. Their labelled personas are independent of
savings-circle identities and records. Historical ajo classification does not
create circle membership or prove a contribution was received.

## Stack

- **Frontend:** React + Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, Recharts,
  TanStack Query. Lives in `web/`.
- **Backend / ML:** Python + FastAPI (Pydantic v2). Dedup uses the Hungarian algorithm
  (`scipy.optimize.linear_sum_assignment`), RapidFuzz for name/narration similarity,
  scikit-learn for confidence-tier scoring, NetworkX for the communal graph.
- **GenAI explainer:** Claude (latest model), grounded so every number traces back to
  computed facts.
- **Savings persistence:** Python standard-library SQLite, with integer kobo amounts.
- **Analytics data:** a file-backed persona provider; live Mono integration remains future work.

## Layout

```
engine/            Pure, stateless core IP (no web/DB/network)
  dedup/           Stage 1 — cross-institution transfer dedup
  communal/        Stage 2 — ajo/esusu, dependents, lending, remittances
  schemas/         Pydantic v2 models
  explainer/       Grounded Claude explainer (offline stub by default)
  harness.py       Dedup eval harness
  communal_harness.py
api/               FastAPI app: savings service and secondary engine endpoints
backend/           Scripts, persona fixtures, re-export shims for legacy imports
  app/explainer/   Thin re-export shim → engine/explainer/
  data/mock/       Labelled persona dataset
web/               Next.js frontend
docs/              Design + decision records
```

> Note: the engine standardizes on the float-backed `Transaction` in
> `engine/schemas/transaction.py`, re-exported as `engine.Transaction`. See
> [docs/transaction-model-decision.md](docs/transaction-model-decision.md) for the resolution.

## Running it

### Backend / engine (Python ≥ 3.9)

```bash
python -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
```

API server (from repo root):

```bash
.venv/bin/python -m uvicorn api.main:app --reload   # serves :8000
```

See [RUNNING.md](RUNNING.md) for the full stack (API + frontend, or Docker).

Eval harnesses (from repo root):

```bash
.venv/bin/python -m engine.harness            # dedup precision/recall
.venv/bin/python -m engine.communal_harness   # communal classifier P/R/F1
```

Tests:

```bash
.venv/bin/python -m pytest -q                 # savings, API, engine, backend suites
```

The GenAI explainer runs offline against a deterministic stub by default. Set `AJORA_EXPLAINER=offline` to force this credential-free demo mode. For the live
Claude path, install `anthropic` (already in requirements) and set `ANTHROPIC_API_KEY`.

### Frontend

```bash
cd web
npm install
npm run dev
```

## Deployment

Containerized with Docker. No database service to provision; retain `AJORA_STATE_DIR`
on a persistent volume and back up savings state. Browser identities and manual
payment tracking are MVP capabilities, not production authentication or payment infrastructure.

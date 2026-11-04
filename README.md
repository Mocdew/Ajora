# Ajora

**Ajo and esusu savings circles, with clear contributions and payout turns.**
Zecathon 2025 — Team P4L.

Ajora helps members organise a rotating savings circle and keep a shared record of
who has contributed and whose turn it is to collect.

1. **Create or join a circle** with an invite code, contribution amount, weekly or
   monthly schedule, membership limit, start date, and rules.
2. **Accept the final agreement** including the payout order and collection account.
   Every member acknowledges the current version before the organiser starts.
3. **Track contribution instalments** with integer kobo amounts. Keep submitted,
   manually confirmed, and demo-feed-matched payments distinct; partial payments
   contribute only their actual accepted amount.
4. **Record an external payout**, then let its recipient confirm receipt or report a
   discrepancy. The round advances only after the recipient confirms receipt.
5. **Follow the shared history** of agreements, contributions, corrections and
   payouts. Refresh the record or share a summary through WhatsApp.

Ajora records **payments made outside the app**; it does not collect, hold, or
transfer money. The collection-account feed is a clearly labelled **demo**. It
exercises reference-and-amount matching without banking credentials and does not
prove that real money arrived. Live Mono integration remains future work.

A display name creates an identity with a 30-day HttpOnly browser session. Generate
and privately save a recovery key under **Account access** to regain the same
identity after cookie expiry or on another device. The server stores only its hash.
Replacing the key invalidates the previous one; recovery revokes previous browser
sessions. Use separate browsers or browser profiles for different circle members.
These identities are not verified bank identities.

## Architecture: durable circles, ephemeral bank analytics

No database server is required. The savings service uses the sanctioned SQLite
fallback because circle membership, obligations, and payment records must survive
restarts. `AJORA_STATE_DIR/savings.sqlite3` stores this state, recovery-key hashes,
receipt allocations, and the circle event history; the default state
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
on a persistent volume and back up savings state. Keep recovery keys private. The
demo bank feed is for rehearsal; connecting live banks and processing payments are
separate integrations.

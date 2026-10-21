# Ajora

**Consent-first, multi-bank financial insights for Nigeria.** Zecathon 2025 — Team P4L.

Every transaction aggregator naively sums credits as "income" and debits as "spending."
For Nigerians who move money between their own banks, that double-counts the same naira on
both sides — inflating income and spending by 30–40%. Ajora's core IP removes that noise
and surfaces the financial life underneath it:

1. **Cross-institution transfer dedup** — finds the "phantom" self-transfers (a debit on
   one bank mirrored by a credit on another) and nets them out.
2. **Communal-finance classification** — recognizes the money patterns that matter in
   Nigeria but that generic tools miss: ajo/esusu contributions and payouts, "black tax"
   dependents, informal lending, and remittances.
3. **GenAI explainer** — puts the numbers in plain language. It *explains* the figures;
   it never computes them.

## Architecture: stateless, no database

By design, Ajora runs **without Postgres or any database server** — it backs the
data-minimization promise ("nothing collected just in case").

- **No persisted raw bank data.** The engine is stateless: pull → normalize → dedup →
  classify → serve JSON, all in memory, per request.
- **Demo data is files.** The labelled persona dataset is JSON loaded at startup.
- **Durable state is append-only files**, not a DB: `audit.jsonl` (access log),
  `corrections.jsonl` (user confirm/reject feedback), and encrypted consent token(s).
- SQLite is the only sanctioned drop-in if queryable persistence is ever truly needed.

## Stack

- **Frontend:** React + Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, Recharts,
  TanStack Query. Lives in `web/`.
- **Backend / ML:** Python + FastAPI (Pydantic v2). Dedup uses the Hungarian algorithm
  (`scipy.optimize.linear_sum_assignment`), RapidFuzz for name/narration similarity,
  scikit-learn for confidence-tier scoring, NetworkX for the communal graph.
- **GenAI explainer:** Claude (latest model), grounded so every number traces back to
  computed facts.
- **Data aggregation:** open-banking APIs (Mono first) behind a schema-matched mock layer,
  so the demo runs without live bank credentials.

## Layout

```
engine/            Pure, stateless core IP (no web/DB/network)
  dedup/           Stage 1 — cross-institution transfer dedup
  communal/        Stage 2 — ajo/esusu, dependents, lending, remittances
  schemas/         Pydantic v2 models
  explainer/       Grounded Claude explainer (offline stub by default)
  harness.py       Dedup eval harness
  communal_harness.py
api/               FastAPI app (api.main:app) — HTTP layer over the engine
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
.venv/bin/python -m pytest engine -q          # engine suite
cd backend && ../.venv/bin/python -m pytest -q # backend suite (explainer, personas)
```

The GenAI explainer runs offline against a deterministic stub by default. For the live
Claude path, install `anthropic` (already in requirements) and set `ANTHROPIC_API_KEY`.

### Frontend

```bash
cd web
npm install
npm run dev
```

## Deployment

Containerized with Docker; deploy on a PaaS (Render / Railway / Fly). No database service
to provision.

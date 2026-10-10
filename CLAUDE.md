# Zenith / Ajora

**Ajora** — a consent-first, multi-bank financial insights platform for Nigeria
(Zecathon 2025, Team P4L). Core IP is two stages: cross-institution **transfer dedup**
(the "phantom" self-transfers that inflate every aggregator's income/spending by
30–40%) and **communal-finance classification** (ajo/esusu, "black tax" dependents,
informal lending, remittances), with a GenAI explainer on top.

## Stack

**Frontend:** React + **Next.js** (App Router) + TypeScript, Tailwind + shadcn/ui,
Recharts for charts, React Flow (or Cytoscape.js) for the relationship graph,
TanStack Query over an OpenAPI-generated typed client. Prefer **Frontend Developer**
for UI work (React/Next.js, not Laravel/Livewire).

**Backend / ML:** Python + **FastAPI** (Pydantic v2). Dedup pipeline:
`scipy.optimize.linear_sum_assignment` (Hungarian), RapidFuzz for name/narration
similarity, pandas for transaction wrangling, scikit-learn for confidence-tier
scoring, NetworkX for the communal relationship graph. GenAI explainer uses Claude
(latest Claude model; explains numbers, **never computes** them). An eval harness
reports precision/recall on the labelled persona dataset.

**Data aggregation:** open-banking APIs (Mono first — Nigeria-friendly) behind a
schema-matched mock layer so the demo runs without live bank credentials.

### Architecture: no database (stateless, compute-ephemerally)

We deliberately run **without Postgres or any DB server** — it fits the deck's
data-minimization promise ("nothing collected just in case").

- **No persisted raw bank data.** The engine is stateless: pull → normalize → dedup
  → classify → serve JSON, all in memory, per request. Raw transactions are not stored.
- **Demo data = files.** The labelled persona dataset lives as JSON/Parquet files
  loaded at startup, not in a DB.
- **Minimal durable state = append-only files**, not a DB:
  - `audit.jsonl` — append-only access log, so the "auditable, never sold" claim is real.
  - `corrections.jsonl` — user confirm/reject feedback; retrain the scorer offline.
  - Encrypted consent token(s) — the one thing production must persist durably
    (move to a secrets store / object storage when deployed; never a database here).
- **SQLite is the only allowed drop-in** if a feature genuinely needs queryable
  persistence — a single file, no server. Do **not** reintroduce Postgres/a DB server
  without updating this section first.

**Infra:** containerised with Docker; deploy on a PaaS (Render/Railway/Fly). No
database service to provision.

## Agent routing

These agents live in `~/.claude/agents/`. Delegate to them for the work below. When no
rule matches, handle it directly or pick the closest agent.

### Planning & architecture
- **System / app design, major structural decisions, tech-stack trade-offs** →
  `engineering-software-architect`
- **API design, data models, service boundaries, backend structure** →
  `engineering-backend-architect`
- **Joining a new or unfamiliar part of the codebase, mapping how it fits together** →
  `engineering-codebase-onboarding-engineer`

### Implementation
- **General feature implementation, premium web UI, polished front-end builds** →
  `engineering-senior-developer`
- **UI components, styling, client-side behavior** → `engineering-frontend-developer`
- **Quick spikes, throwaway prototypes, proof-of-concept to validate an idea fast** →
  `engineering-rapid-prototyper`
- **Small, surgical edits where the change must stay minimal and low-risk** →
  `engineering-minimal-change-engineer`

### AI / ML / LLM work
- **ML models, AI features, data pipelines, model deployment** →
  `engineering-ai-engineer`
- **Prompt design, prompt tuning, evals** → `engineering-prompt-engineer`
- **Retrieval-augmented generation, vector search, retrieval layers** →
  `engineering-rag-pipeline-engineer`
- **Fine-tuning / post-training of LLMs** → `engineering-llm-post-training-engineer`
- **Multi-agent orchestration and coordination design** →
  `engineering-multi-agent-systems-architect`
- **Autonomous/self-optimizing system design** →
  `engineering-autonomous-optimization-architect`
- **Voice / speech AI integration** → `engineering-voice-ai-integration-engineer`
- **Cleaning or remediating AI/ML training data** →
  `engineering-ai-data-remediation-engineer`

### Review, docs & workflow
- **Reviewing a diff or PR before merge** → `engineering-code-reviewer`
  (run this before committing anything non-trivial)
- **Writing or updating docs, READMEs, technical guides** →
  `engineering-technical-writer`
- **Branch/commit/merge strategy, resolving git workflow issues** →
  `engineering-git-workflow-master`

## Notes
- Several agents reference workflow files (e.g. `ai/system/*.md`) that don't exist in
  this repo; they'll run fine without them.
- The Senior Developer agent defaults to Laravel/Livewire/FluxUI idioms, which do **not**
  match this stack — steer it explicitly to React/Next.js + Python/FastAPI, or prefer
  the Frontend Developer (UI) and AI Engineer / Backend Architect (pipeline) agents.
- **No database** is an architectural decision, not an omission (see Stack). Don't let
  an agent add Postgres or an ORM-backed DB layer; persistence is append-only files, with
  SQLite as the only sanctioned fallback.

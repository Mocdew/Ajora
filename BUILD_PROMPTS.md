# Ajora — Build Prompts

Copy-paste prompts for each engineer, phase by phase. Each prompt is written to drop
straight into a Claude Code session. Every prompt names the agent to route to (from
`CLAUDE.md`), the deliverable, the constraints, and the "done" bar.

## How to use
1. Each engineer works in their own Claude Code session in this repo (so `CLAUDE.md`
   and the Ajora deck are already in context).
2. Prepend the **Shared Context** block below the first time in a session if the model
   seems to lack project context; otherwise go straight to the phase prompt.
3. Run the phases top-to-bottom within your role. The **spine (Phase 1) must land first**
   and be shared before the other tracks accelerate.
4. Before merging anything non-trivial, run the `engineering-code-reviewer` agent.

## If you're fewer than 4 engineers
- **3:** merge GenAI/Integration (D) into whoever owns the engine (B).
- **2:** person 1 = Backend + Engine (A+B), person 2 = Frontend + GenAI (C+D).
- **1:** run the phases in the global order — Phase 1 → 6 — doing each role's slice yourself.

---

## Shared Context (prepend when needed)

```
We're building Ajora, a consent-first multi-bank financial insights platform for Nigeria
(Zecathon hackathon). Core moat: a cross-bank TRANSFER DEDUP ENGINE that removes money a
user moves between their own accounts (which naive aggregators double-count), producing
arithmetically correct income/spending. On top of the deduped data we surface Nigeria's
"invisible economy": thrift groups (ajo/esusu), dependents/black-tax, informal lending,
remittances.

Stack: Python + FastAPI backend; dedup via candidate-match → scoring (amount/FX, timing,
name/narration) → Hungarian optimal pairing → confidence tiers; RapidFuzz for string
scoring; NetworkX for the relationship graph; Next.js/React + Recharts + Cytoscape.js
front end; Docker for deploy. A GenAI explainer narrates insights grounded on the data.

Two hard rules:
1. The dedup engine is a PURE Python library: normalized transactions in, deduped +
   tiered transactions out. No FastAPI, DB, or network imports inside it.
2. We build MOCK-FIRST. The demo runs on a labelled persona dataset, not live open
   banking. All data access goes behind one interface so a real provider can slot in later.

Canonical Transaction schema (the spine everything reads/writes):
  id: str                     # stable unique id
  account_id: str             # which of the user's accounts
  institution: str            # e.g. "GTBank", "Zenith", "OPay"
  direction: "debit"|"credit"
  amount: Decimal             # positive magnitude
  currency: str               # ISO 4217, e.g. "NGN", "USD"
  timestamp: datetime         # ISO 8601, tz-aware
  narration: str              # raw description/narration
  counterparty_name: str|None
  counterparty_account: str|None
  balance_after: Decimal|None
  category: str|None          # optional, post-classification
  raw: dict                   # original provider payload

Ground-truth labels in the mock dataset:
  transfer_pair_id: str|None  # same id on the matching debit+credit of a self-transfer
  communal_tag: "ajo"|"dependent"|"lending"|"remittance"|None
```

---

# Role A — Data / Backend Engineer

### A · Phase 1 — Canonical schema + mock data layer
```
Use the engineering-backend-architect agent.
Create the project spine for Ajora.
1. Define the canonical Transaction model (see Shared Context schema) as Pydantic models
   in `engine/models.py` (pure, importable by the engine with no web/db deps).
2. Create a DataProvider interface in `data/provider.py` with one method
   `get_transactions(user_id) -> list[Transaction]`, plus a MockProvider that loads from
   `data/mock/*.json`. Design it so a real Mono/Okra provider can implement the same
   interface later.
3. Write schema adapters that map at least two differently-shaped raw bank payloads into
   the canonical model, to prove the normalization layer works.
Deliverable: importable models + a working MockProvider.
Done when: `MockProvider().get_transactions("persona_1")` returns a list of valid
Transaction objects and a unit test asserts the schema + adapters round-trip correctly.
```

### A · Phase 2 — Engine data access & fixtures support
```
Support the engine track. Make sure the engine can consume data cleanly:
- Provide a tiny loader that feeds MockProvider output into the engine library.
- Keep the engine import-pure: the loader lives OUTSIDE engine/, the engine only receives
  plain Transaction lists.
- Add helpers to split a user's transactions by account and by time window (the engine's
  candidate-match stage needs cross-account pairing within a window).
Done when: the engine's test harness can load any persona by id in one call.
```

### A · Phase 4 — FastAPI layer
```
Use the engineering-backend-architect agent.
Expose the pipeline over FastAPI in `api/`:
- GET /users/{id}/transactions        -> raw normalized transactions
- GET /users/{id}/cashflow            -> deduped income/spending + before/after totals
- GET /users/{id}/insights            -> communal insights (ajo/dependents/lending/remittance)
- GET /users/{id}/graph               -> relationship graph nodes+edges for Cytoscape
Wire these to the engine library + insight engine via the DataProvider. Add CORS for the
Next.js dev origin. Return typed Pydantic responses.
Done when: all four endpoints return correct data for persona_1 and OpenAPI docs render.
```

### A · Phase 5 — Consent, revocation & audit (demo-grade)
```
Use the engineering-backend-architect agent.
Add the trust layer (mock-grade, no real OAuth required for the demo):
- A consent record per connected account (granted/revoked + timestamps).
- Revocation endpoint that stops that account's data flowing into the pipeline.
- An append-only audit log: every data access writes an immutable entry.
Done when: revoking an account visibly removes it from cashflow/insights, and the audit
log shows an entry per access. Keep it swappable for real open-banking consent later.
```

### A · Phase 6 — Dockerize & deploy
````
Use the engineering-git-workflow-master agent for branch/release hygiene, then:
Containerize the app: a Dockerfile for the FastAPI+engine service and one for the Next.js
front end, plus a docker-compose that runs both. Seed the mock dataset into the image.
Done when: `docker compose up` serves the dashboard against the labelled personas on a
clean machine, ready for the demo.
````

---

# Role B — Engine / ML Engineer  (critical path)

### B · Phase 1 — Labelled ground-truth mock dataset
```
Use the engineering-ai-engineer agent.
Build the labelled persona dataset that is BOTH our test fixture and our demo data.
- 2–3 personas (e.g. salaried multi-bank earner; gig/SME owner). Each has 2–4 accounts
  across different institutions, ~3–6 months of transactions, in the canonical schema.
- Include realistic self-transfers between the user's own accounts (with fees/FX on some),
  each labelled with a shared transfer_pair_id on the matching debit+credit.
- Include communal patterns labelled with communal_tag: a monthly ajo contribution, a
  recurring dependent/black-tax transfer, an informal loan out + partial repayment, and a
  cross-currency remittance.
- Save as `data/mock/persona_*.json`.
Done when: the dataset validates against the Transaction schema and every self-transfer and
communal pattern carries a ground-truth label, so precision/recall can be computed.
```

### B · Phase 2 — The dedup engine (the moat)
```
Use the engineering-ai-engineer agent.
Build the dedup engine as a PURE library in `engine/` (no FastAPI/DB/network imports).
Implement the four stages:
1. Candidate match: for each outflow, find inflows in OTHER accounts within a time window
   and amount tolerance (allow for fees/FX).
2. Scoring: score each candidate pair on amount closeness (net of fees/FX), timing gap,
   and name/narration similarity (use RapidFuzz), plus simple user-pattern priors.
3. Optimal pairing: use the Hungarian algorithm (scipy.optimize.linear_sum_assignment) to
   match each transfer exactly once, globally — never greedily.
4. Confidence tiers: auto-accept high-confidence pairs, flag mid-confidence for user
   confirmation, drop low. Output deduped transactions + the pair list + tiers.
Also write a test harness that runs the engine on the labelled dataset and reports
PRECISION / RECALL / F1 on transfer-pair detection, plus before/after income & spending.
Done when: F1 is strong on the labelled set and the harness prints the accuracy report.
Iterate on scoring weights against that number BEFORE touching any UI or API.
```

### B · Phase 3 — Relationship graph + communal classifiers
```
Use the engineering-ai-engineer agent.
Operating ONLY on the deduped output (communal patterns only emerge after dedup):
- Build a NetworkX relationship graph: nodes = the user + external counterparties,
  edges = money flows (direction, total, frequency).
- Classify recurring external relationships into: ajo/esusu (fixed periodic contribution),
  dependent/black-tax (recurring support to a person), informal lending (outflow later
  partially/fully returned by the same counterparty — track net balance), remittance
  (recurring cross-currency outflow).
- Emit structured insight objects (who, how much, how often, net position, your % of income).
Evaluate classification against the communal_tag labels and report accuracy.
Done when: the four insight types are detected on the personas with measured accuracy, and
output is structured for the API + explainer to consume.
```

---

# Role C — Frontend Engineer

### C · Phase 1 — Next.js app shell + design system
```
Use the engineering-frontend-developer agent.
Scaffold the Next.js/React app in `web/`. Set up a clean design system matching the deck's
brand (deep green + warm amber/gold, generous type). Build the app shell, routing, and
reusable primitives (cards, stat tiles, toggle). Read the dataviz skill before building any
chart or stat tile.
Done when: the shell runs locally with a themed layout and placeholder dashboard route.
```

### C · Phase 2 — Dashboard against stubbed data
```
Use the engineering-frontend-developer agent.
Build the core dashboard UI against a STUB JSON matching the planned API shape (don't wait
for the real API). Include:
- The headline "true cashflow" numbers (income/spending/net).
- The DEDUP TOGGLE: show inflated (naive) vs deduped totals side by side — this is the
  signature wow moment; make the ~30–40% drop legible and dramatic.
- Recharts for cashflow over time.
Done when: toggling dedup visibly swaps between inflated and honest numbers on stub data.
```

### C · Phase 3 — Insight cards + relationship graph
```
Use the engineering-frontend-developer agent.
Build the communal-insight section (still on stub data):
- Insight cards for ajo, dependents, lending, remittances (mirror the deck's phrasing, e.g.
  "₦50k/month to your group, next payout ~March, 3rd of 8").
- A Cytoscape.js relationship graph view of the user + counterparties with flow edges.
Done when: cards and graph render from the stubbed insight/graph JSON shape.
```

### C · Phase 4 — Wire to the real API
```
Use the engineering-frontend-developer agent.
Replace the stub JSON with live calls to the FastAPI endpoints (/cashflow, /insights,
/graph, /transactions). Handle loading/empty/error states.
Done when: the full dashboard renders real engine output for the personas end to end.
```

### C · Phase 5 — Consent / revocation / audit screens
```
Use the engineering-frontend-developer agent.
Build the trust screens against Role A's endpoints: connected accounts with per-account
consent, a revoke action, and a view of the append-only audit log. Make revocation's effect
on the dashboard obvious.
Done when: a user can revoke an account and watch it drop out of cashflow/insights live.
```

---

# Role D — GenAI / Integration Engineer

### D · Phase 1 — Explainer eval harness + grounding plan
```
Use the engineering-prompt-engineer agent.
Set up the GenAI groundwork: pick the model, define how the explainer will be GROUNDED
strictly on the user's structured insight objects (no hallucinated numbers), and build a
small eval harness with a few golden insight->explanation examples to test against.
Done when: the eval harness runs and the grounding contract (what data the prompt may use)
is written down.
```

### D · Phase 3 — Insight explainer
```
Use the engineering-prompt-engineer agent (and engineering-ai-engineer for wiring).
Build the LLM explainer that turns structured insight objects (from Role B Phase 3) into
plain-language narration in Nigerian financial context — e.g. the ajo/dependent/lending
lines from the deck. It must only use numbers present in the input (grounded), never invent.
Done when: given a persona's insight objects, it produces accurate, natural explanations
that pass the eval harness.
```

### D · Phase 4 — Explainer endpoint + dashboard hook
```
Add a GET /users/{id}/explanations endpoint (or extend /insights) that returns the
grounded narration, and coordinate with Role C to surface it on the insight cards.
Done when: insight cards show accurate LLM narration generated from real engine output.
```

### D · Phase 6 — Demo script & dry run
```
Own the demo narrative: script the flow (naive inflated view → flip the dedup toggle →
honest numbers → reveal the communal insights → trust/consent screen), using the most
compelling persona. Rehearse against the deployed Docker build; have a fallback recording.
Done when: a 3–5 minute demo runs cleanly start to finish on the labelled personas.
```


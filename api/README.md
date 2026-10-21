# Ajora API

HTTP API for **Ajora** — consent-first, multi-bank financial insights for Nigeria. It
exposes the engine pipeline over four read-only resources: raw transactions, cross-bank
transfer-deduped **cashflow**, communal-finance **insights** (ajo/esusu, dependents,
informal lending, remittance), the relationship **graph**, and grounded GenAI
**explanations**.

- **Stack:** FastAPI + Pydantic v2 (Python 3.9).
- **Stateless, no database.** Every request loads a persona from file, runs the engine
  in memory, and returns JSON. Nothing is persisted; raw bank data is never stored.
- **The API owns no business logic** — it loads data through a `DataProvider` and calls
  the pure `engine` library. All numbers come from the engine; the GenAI layer only
  *explains* them, it never computes them.

> **Interactive docs are built in:** run the server and open
> **http://localhost:8000/docs** (Swagger UI) or **/redoc**. The machine-readable schema
> is at **/openapi.json**. This README is the narrative reference; the OpenAPI spec is the
> contract.

---

## Quick start

```bash
# from the repo root, with the project venv
.venv/bin/python -m uvicorn api.main:app --reload
```

Serves on **http://localhost:8000**. Smoke-test:

```bash
curl -s http://localhost:8000/health
curl -s http://localhost:8000/users | python3 -m json.tool
```

Dependencies (`fastapi`, `uvicorn[standard]`, plus the engine's `scipy`/`rapidfuzz`/
`scikit-learn`/`numpy`/`networkx`/`pydantic`) are pinned in
[`backend/requirements.txt`](../backend/requirements.txt) and already installed in `.venv`.
Change the port with `--port 8001` if 8000 is taken.

---

## Architecture

```
HTTP request
   │
   ▼
api/main.py        FastAPI app: CORS, router, /health
   │
api/routes.py      thin handlers; map a missing user → 404
   │
   ├── api/service.py         pure engine pipeline for the 4 data endpoints
   │        load → DedupEngine.dedup → build_insights → graph elements
   └── api/explanations.py    the explainer service (/users, /explanations)
   │
api/providers.py   DataProvider seam → engine.schemas.transaction.TransactionBatch
   │
engine/            the pure library (dedup, communal, explainer) — no web/DB imports
```

Pipeline order is fixed: **dedup first**, then communal insights on the *deduped* ledger,
then the graph. (Communal patterns only emerge after self-transfers are netted out.)

### The `DataProvider` seam

All data access goes through [`api/providers.py`](providers.py):

```python
class DataProvider(Protocol):
    def list_users(self) -> list[str]: ...
    def get_batch(self, user_id: str) -> TransactionBatch: ...   # raises UserNotFound
```

The only implementation today is `FilePersonaProvider`, which reads the labelled fixtures
in `backend/data/mock/persona_*.json` (+ `backend/data/sample_transactions.json`). A live
`MonoProvider` / `OkraProvider` would implement the same two methods and drop in with **no
route changes**.

---

## Conventions

| | |
|---|---|
| **Base URL** | `http://localhost:8000` (dev) |
| **Methods** | all endpoints are `GET` (read-only) |
| **Money** | floats in **NGN**, already FX-normalized by the engine (a USD leg is converted before summing) |
| **Casing** | engine-backed endpoints use **`snake_case`**; `/explanations` uses **`camelCase`** (it mirrors the frontend's existing type verbatim) |
| **Timestamps** | ISO-8601 strings as stored in the fixtures |
| **IDs** | `user_id` path param, e.g. `u_persona_c` (see [Personas](#personas)) |
| **Eval labels** | `transfer_pair_id` / `communal_tag` are ground-truth only and are **never** serialized — they cannot leak to a client |

### Errors

A request for an unknown user returns **404** with a JSON body:

```json
{ "detail": "No data for user 'nobody'." }
```

Validation errors (malformed path) return FastAPI's standard **422**. There are no auth
errors — the demo API is unauthenticated — but consent **is** enforced per account (see
[Trust layer](#trust-layer-consent--audit)): a revoked account is dropped from the
pipeline, and revoking/granting an account that isn't the user's returns **404**.

---

## Connecting from the frontend

The browser does **not** call `:8000` directly. The Next.js app proxies through its own
origin to avoid CORS entirely (see [`web/next.config.ts`](../web/next.config.ts)):

```
browser → GET /api/engine/users/{id}/cashflow   (same-origin, no CORS)
            │  Next.js rewrite (server-side)
            ▼
          GET {AJORA_API_BASE}/users/{id}/cashflow     (default http://localhost:8000)
```

- `AJORA_API_BASE` (server-only env) points Next at the engine; in prod set it to the
  deployed engine URL — no frontend code changes.
- Client helper `engineGet()` in `web/lib/api/engine.ts` prefixes `/api/engine`.
- **CORS:** the app also sets an allow-list covering both dev origins —
  `http://localhost:3000` / `127.0.0.1:3000` and `http://localhost:3100` / `127.0.0.1:3100` —
  for *direct* browser access. The dev server runs on **:3100** but reaches the API through
  the proxy, so CORS doesn't apply to it anyway. To call the API directly from a browser on
  some other origin, add it to `_DEV_ORIGINS` in [`api/main.py`](main.py) (one line).

---

## Endpoints

### `GET /health`

Liveness probe + the personas this instance can serve.

```json
{ "status": "ok", "users": ["u_demo_stephen","u_persona_a","u_persona_b","u_persona_c"] }
```

### `GET /users`

The demo roster.

| field | type | meaning |
|---|---|---|
| `id` | string | the `user_id` to use in other paths |
| `name` | string | account holder's full name |
| `accounts` | int | number of linked accounts |
| `transactions` | int | transactions in the fixture |

```json
[
  { "id": "u_persona_c", "name": "Funmilayo Adeyemi", "accounts": 3, "transactions": 83 }
]
```

### `GET /users/{user_id}/transactions`

The raw, normalized ledger **before** dedup — the "naive" view.

| field | type | notes |
|---|---|---|
| `user_id`, `full_name` | string | |
| `count` | int | length of `transactions` |
| `transactions[]` | Transaction | see [Transaction](#transaction) |

```json
{
  "user_id": "u_persona_c", "full_name": "Funmilayo Adeyemi", "count": 83,
  "transactions": [
    { "id": "st080", "account_id": "gtb-c01", "institution": "gtbank",
      "amount": 45000.0, "currency": "NGN", "direction": "debit",
      "timestamp": "2026-07-03T10:00:00",
      "narration": "TRF/FUNMILAYO ADEYEMI/to self GTBANK-OPAY/REF:770998811234",
      "counterparty_name": "FUNMILAYO ADEYEMI", "reference": "770998811234",
      "balance": null, "raw_category": "transfer" }
  ]
}
```

### `GET /users/{user_id}/cashflow`

Runs the dedup engine and returns the **before/after** story — the signature "phantom
self-transfers inflated your numbers by ~30-40%" moment.

| field | type | meaning |
|---|---|---|
| `before_after.income_before_ngn` | float | naive gross income (sum of credits) |
| `before_after.income_after_ngn` | float | **honest** income after removing transfer credits |
| `before_after.spending_before_ngn` / `spending_after_ngn` | float | same for spending |
| `before_after.income_inflation_pct` / `spending_inflation_pct` | float | how much phantom transfers inflated each |
| `before_after.transfer_volume_ngn` | float | value removed as internal self-transfers |
| `before_after.matched_transfer_count` | int | number of self-transfer pairs removed |
| `totals` | Totals | the full engine totals (same figures, unrolled) |
| `matches[]` | MatchedTransfer | the phantom pairs that were netted out |
| `deduped_transaction_count` | int | transactions remaining after removing both legs of each match |
| `internal_transfer_ids[]` | string | ids flagged as internal-transfer legs |
| `unmatched_candidate_count` | int | transfer-like transaction legs left untouched because no confident partner was found |

**MatchedTransfer:** `{ match_id, debit: Transaction, credit: Transaction, score (0–1),
tier ("high"|"medium"|"low"), fee (NGN lost between legs), cross_currency (bool),
reasons: string[] }`.

<details><summary>Example (one match shown)</summary>

```json
{
  "user_id": "u_persona_c", "full_name": "Funmilayo Adeyemi",
  "before_after": {
    "income_before_ngn": 1101180.0, "income_after_ngn": 1021200.0,
    "spending_before_ngn": 861800.0, "spending_after_ngn": 781800.0,
    "income_inflation_pct": 7.8, "spending_inflation_pct": 10.2,
    "transfer_volume_ngn": 79990.0, "matched_transfer_count": 2
  },
  "totals": {
    "gross_income": 1101180.0, "gross_spending": 861800.0, "transfer_volume": 79990.0,
    "net_income": 1021200.0, "net_spending": 781800.0,
    "income_inflation_pct": 7.8, "spending_inflation_pct": 10.2
  },
  "matches": [
    {
      "debit":  { "id": "st080", "institution": "gtbank", "amount": 45000.0, "direction": "debit",  "reference": "770998811234", "...": "..." },
      "credit": { "id": "st081", "institution": "opay",   "amount": 45000.0, "direction": "credit", "reference": "770998811234", "...": "..." },
      "score": 0.98, "tier": "high", "fee": 0.0, "cross_currency": false,
      "reasons": [
        "Shared transfer reference on both legs", "Exact amount match",
        "Counterparty matches the account holder's own name",
        "Credit landed within an hour of the debit", "Moves between two different banks"
      ]
    }
  ],
  "deduped_transaction_count": 79,
  "internal_transfer_ids": ["st080","st081","st082","st083"]
}
```
</details>

> **The dedup toggle** reads `income_before_ngn` vs `income_after_ngn` (and the spending
> pair); `income_inflation_pct` is the callout number.

### `GET /users/{user_id}/insights`

Communal-finance relationships, computed on the **deduped** ledger. One object per external
relationship.

`insights` → `CommunalInsights`:

| field | type | meaning |
|---|---|---|
| `net_income_ngn` | float | denominator for `pct_of_net_income` (deduped net income) |
| `insights[]` | CommunalInsight | one per relationship, largest-footprint first |

`CommunalInsight`:

| field | type | meaning |
|---|---|---|
| `counterparty` | string | resolved person/entity on the other side |
| `relationship_type` | enum | `ajo_esusu` · `dependent` · `informal_lending` · `remittance` |
| `confidence` | float 0–1 | strongest member confidence |
| `tier` | enum | `high` (auto-surface) · `medium` (confirm) |
| `total_out_ngn` / `total_in_ngn` | float | money sent / received |
| `net_position_ngn` | float | `out − in`; for `informal_lending` = outstanding balance owed to the user |
| `count` | int | member transactions |
| `cadence` | enum | `one-off`·`weekly`·`biweekly`·`monthly`·`quarterly`·`irregular` |
| `first_seen` / `last_seen` | date | |
| `months_active` | int | distinct calendar months with activity |
| `pct_of_net_income` | float | relevant volume as % of net income (basis varies by type — see field doc in [`engine/schemas/communal.py`](../engine/schemas/communal.py)) |
| `member_transaction_ids` | string[] | provenance |
| `tags` | string[] | raw per-transaction tags rolled up |
| `reasons` | string[] | human-readable signals; `reasons[0]` is a ready-made headline |

<details><summary>Example (one insight shown)</summary>

```json
{
  "user_id": "u_persona_c", "full_name": "Funmilayo Adeyemi",
  "insights": {
    "net_income_ngn": 1021200.0,
    "insights": [
      {
        "counterparty": "TUNDE ADEYEMI", "relationship_type": "dependent",
        "confidence": 0.99, "tier": "high",
        "total_out_ngn": 120000.0, "total_in_ngn": 0.0, "net_position_ngn": 120000.0,
        "count": 4, "cadence": "monthly",
        "first_seen": "2026-06-27", "last_seen": "2026-09-27", "months_active": 4,
        "pct_of_net_income": 11.75,
        "member_transaction_ids": ["t004","t023","t042","t061"],
        "tags": ["dependent"],
        "reasons": [
          "Recurring dependent support (“black tax”) — money sent to a person on a regular basis.",
          "4 transaction(s), monthly cadence",
          "narration cue: BROTHER, SCHOOL FEES, SUPPORT",
          "recurring monthly support (4 months)"
        ]
      }
    ]
  }
}
```
</details>

### `GET /users/{user_id}/graph`

The relationship graph as **Cytoscape** nodes + edges (built from the insights, so it stays
consistent with the cards).

**Node:** `{ id, label, kind ("user"|"counterparty"), relationship_type, tier,
net_position_ngn, total_out_ngn, total_in_ngn, count, cadence, pct_of_net_income }`.
The account holder is a single node with the sentinel id **`"__user__"`**; its typed/stat
fields are null/0.

**Edge:** `{ id, source, target, relationship_type, label, net_ngn, total_ngn, count }`.
Direction follows net flow: `user → counterparty` when the user is a net sender (ajo,
dependent), `counterparty → user` when a net receiver (e.g. `remittance`). Color by
`relationship_type`.

```json
{
  "user_id": "u_persona_c", "full_name": "Funmilayo Adeyemi",
  "nodes": [
    { "id": "__user__", "label": "Funmilayo Adeyemi", "kind": "user",
      "relationship_type": null, "tier": null, "net_position_ngn": 0.0,
      "total_out_ngn": 0.0, "total_in_ngn": 0.0, "count": 0, "cadence": null,
      "pct_of_net_income": 0.0 },
    { "id": "TUNDE ADEYEMI", "label": "TUNDE ADEYEMI", "kind": "counterparty",
      "relationship_type": "dependent", "tier": "high", "net_position_ngn": 120000.0,
      "total_out_ngn": 120000.0, "total_in_ngn": 0.0, "count": 4, "cadence": "monthly",
      "pct_of_net_income": 11.75 }
  ],
  "edges": [
    { "id": "__user__->TUNDE ADEYEMI", "source": "__user__", "target": "TUNDE ADEYEMI",
      "relationship_type": "dependent", "label": "dependent",
      "net_ngn": 120000.0, "total_ngn": 120000.0, "count": 4 }
  ]
}
```

To feed Cytoscape's `elements`, map each node/edge to `{ data: { ... } }`.

### `GET /users/{user_id}/explanations`

Grounded GenAI narration of the user's real engine output. **camelCase** (mirrors the
frontend type). Today only the `dedup` insight is narrated; the map is keyed so communal
narration slots in later.

| field | type | meaning |
|---|---|---|
| `userId`, `userName` | string | |
| `generatedBy` | string | model id, or `"stub-offline"` when no API key |
| `explanations` | map | keyed by insight; `dedup` always present |
| `explanations.dedup.insightKey` | string | `"dedup"` |
| `explanations.dedup.narration` | string | the user-facing sentence(s) |
| `explanations.dedup.grounded` | bool | true when every cited number traces to engine output |
| `explanations.dedup.facts` | object | the engine figures the narration is grounded on |

```json
{
  "userId": "u_persona_c", "userName": "Funmilayo Adeyemi",
  "generatedBy": "stub-offline",
  "explanations": {
    "dedup": {
      "insightKey": "dedup",
      "narration": "Funmilayo, we found 2 transfer(s) you made between your own banks, moving ₦79,990 in total. That money is not new income or new spending, so counting it inflated your income by 7.8%. Your real income is ₦1,021,200, not the ₦1,101,180 a naive view shows. The largest move, ₦45,000 from gtbank to opay, is a high-confidence match (98%).",
      "grounded": true,
      "facts": { "...": "engine figures" }
    }
  }
}
```

**Grounding guarantee:** narration is generated from real engine output and every number is
verified against the engine's figures. With `ANTHROPIC_API_KEY` set (and the `anthropic`
SDK installed) the live model writes it (`claude-sonnet-5-5`); otherwise a deterministic
offline stub does. If the live model ever returns an ungrounded number, the service falls
back to the stub — it never serves a figure the engine didn't produce.

---

## Trust layer (consent, audit & corrections)

Consent is **per connected account**, and it is enforced, not cosmetic: revoking an
account removes its transactions **before** the engine runs, so `/cashflow`, `/insights`,
`/graph` and `/explanations` all recompute on the consented ledger. Every data access
writes one immutable line to an append-only audit log. Confirm/reject feedback on a
transfer match is validated against the current consented ledger and appended to a
separate corrections log for offline scorer improvement.

The consent store, audit log, and corrections log sit behind small interfaces
([`api/consent.py`](consent.py), [`api/audit.py`](audit.py),
[`api/corrections.py`](corrections.py)) so production sinks can replace the file-backed
defaults with no route changes — the same pattern as the
[`DataProvider`](#the-dataprovider-seam) seam.

### The consent-filter seam

All five data endpoints load through one choke point, `consented_batch()` in
[`api/consent.py`](consent.py):

```
provider.get_batch(user_id)          # raw batch (raises UserNotFound -> 404)
   │  ensure_seeded  → first sight of a user: every account recorded "granted"
   │  drop transactions whose account is revoked; shrink user.account_ids
   │  audit_log.record(...)          # exactly one append-only entry per call
   ▼
engine (dedup → insights → graph)    # never sees a revoked account
```

Because the filter runs once, at the single load point, no endpoint duplicates engine
calls and the trust layer lives in exactly one place. (The `GET /users` roster is not a
per-user data access and is not audited.)

### Endpoints

| method + path | does |
|---|---|
| `POST /users/{user_id}/accounts/{account_id}/revoke` | Revoke consent; returns the updated `ConsentRecord`. 404 if the account isn't one of the user's. |
| `POST /users/{user_id}/accounts/{account_id}/grant` | Re-grant a revoked account (so the demo can toggle back); returns the updated `ConsentRecord`. |
| `GET /users/{user_id}/consents` | `{ user_id, consents: ConsentRecord[] }` — one record per connected account. |
| `GET /users/{user_id}/audit` | `{ user_id, entries: AuditEntry[] }` — the user's access log, oldest-first. |
| `POST /users/{user_id}/corrections` | Append `{ match_id, verdict: "confirm"|"reject" }` for a current match; returns the immutable `CorrectionRecord`. |

**`ConsentRecord`:** `{ user_id, account_id, institution, status ("granted"|"revoked"),
granted_at (datetime), revoked_at (datetime|null) }`.

**`AuditEntry`:** `{ timestamp (UTC ISO), user_id, endpoint ("cashflow"|…),
accounts_accessed (string[] — the consented accounts actually read),
revoked_excluded (string[] — the user's accounts withheld) }`.

**`CorrectionRecord`:** `{ timestamp, user_id, match_id, verdict,
debit_transaction_id, credit_transaction_id, previous_score, previous_tier }`.
The endpoint records `correction_confirm` or `correction_reject` in the audit log;
it does not rewrite current cashflow totals.

### Durable state = append-only files (no DB)

Per [`CLAUDE.md`](../CLAUDE.md), durable state is append-only files, never a database:

- **`consent.jsonl`** (repo root) — one grant/revoke **event** per line
  (`{ts, user_id, account_id, institution, action}`). Current consent is the fold of
  these events in order; seeding appends a `grant` event per account the first time a
  user is seen. The file is never rewritten.
- **`audit.jsonl`** (repo root) — one `AuditEntry` per line, append-only, so the
  "auditable, never sold" claim is real and tamper-evident.
- **`corrections.jsonl`** (repo root) — one confirmed/rejected match verdict per
  line. Records are training signals consumed by an offline scorer-improvement pass.

All paths are injectable and swapped for temporary files in tests; all are git-ignored.

### Revoke in action (`u_persona_c`)

Funmilayo has three accounts (`gtb-c01`, `opay-c02`, `palmpay-c03`), all granted by
default. Revoking `palmpay-c03` — the credit leg of one self-transfer pair — changes the
numbers immediately:

| | before | after `revoke palmpay-c03` |
|---|---|---|
| `/transactions` count | 83 | **62** |
| `matched_transfer_count` | 2 | **1** |
| `net_spending_ngn` | 781,800 | **619,600** |

Revoking `opay-c02` instead drops the **dependent** and **informal-lending** relationships
(`/insights` goes 3 → 1, leaving only the ajo), `matched_transfer_count` → 0, and
`net_income` 1,021,200 → **863,980**. `grant` restores either fully.

---

## Data models

### Transaction

The normalized shape every bank feed maps to (source of truth:
[`engine/schemas/transaction.py`](../engine/schemas/transaction.py)).

| field | type | notes |
|---|---|---|
| `id` | string | stable unique id |
| `account_id` | string | which of the user's accounts |
| `institution` | string | bank slug, e.g. `gtbank`, `opay`, `access` |
| `amount` | float | **positive magnitude**; direction is separate |
| `currency` | string | ISO 4217, default `NGN` |
| `direction` | enum | `debit` (outflow) · `credit` (inflow) |
| `timestamp` | datetime | ISO-8601 |
| `narration` | string | raw bank narration |
| `counterparty_name` | string? | if the bank supplies it |
| `reference` | string? | NIP session id; a shared ref is a strong self-transfer signal |
| `balance` | float? | running balance after the txn, if supplied |
| `raw_category` | string? | category as the bank labelled it |

### Enums at a glance

- **direction:** `debit`, `credit`
- **dedup tier:** `high` (auto-accept), `medium` (confirm), `low` (dropped)
- **relationship_type:** `ajo_esusu`, `dependent`, `informal_lending`, `remittance`
- **communal tier:** `high`, `medium`
- **cadence:** `one-off`, `weekly`, `biweekly`, `monthly`, `quarterly`, `irregular`

---

## Personas

| id | name | note |
|---|---|---|
| `u_persona_a` | Adaeze Okonkwo | big dedup story (**28.3%** income inflation), **no** communal insights |
| `u_persona_b` | Emeka Balogun | dependent + remittance (frontend default demo user) |
| `u_persona_c` | Funmilayo Adeyemi | richest communal mix: ajo + dependent + lending — best for cards/graph |
| `u_demo_stephen` | Stephen Vincent | small standalone sample |

---

## Generating a typed client

The OpenAPI spec at `/openapi.json` can generate a typed client:

```bash
npx openapi-typescript http://localhost:8000/openapi.json -o web/lib/api/engine.types.ts
```

---

## Testing

```bash
.venv/bin/python -m pytest api -q        # endpoints, trust paths, OpenAPI, every persona
```

Tests use FastAPI's `TestClient` against the real engine (no mocks), so green means
load → dedup → insights → graph → explain all wire together.

---

## Roadmap

Not yet built (tracked in the project plan):

- **Communal narration** — `/explanations` currently narrates only `dedup`; ajo/dependent/
  lending/remittance explanations slot into the same `explanations` map once wired.
- **Live provider** — a `MonoProvider`/`OkraProvider` implementing `DataProvider`.
```

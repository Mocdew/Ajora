# Plan — Transfers & Dedup section

**Status:** planned, not built. **Builder:** Frontend Developer agent (per CLAUDE.md routing).

**Goal:** replace the `<ComingSoon>` placeholder at `web/app/(app)/transfers/page.tsx` with a
working dedup review surface.

The engine **already serves all the data**: `GET /users/{id}/cashflow` returns `matches[]`,
each with both transaction legs (`debit`, `credit`), a confidence `score`, a `tier`
(`high`/`medium`/`low`), a `fee`, a `cross_currency` flag, and human-readable `reasons[]`
(e.g. "Shared transfer reference on both legs"). It also returns `before_after` totals,
`unmatched_candidate_count`, and `internal_transfer_ids`. So **Phase 1 is frontend-only.**

**Tier semantics already in the engine** drive the whole UX:
`high` = auto-accepted · `medium` = needs user confirmation · `low` = dropped.

## Phase 1 — Matched-pairs explorer (read-only, ships independently)

### New files
- `web/lib/api/dedup.ts` — a `useDedup(userId)` hook. Mirror `web/lib/api/dashboard.ts`
  exactly: `useQuery` + `engineGet` + `engineKeys`, typed off the existing `MatchedTransfer`
  / `CashflowResponse` in `web/lib/api/engine-types.ts` (OpenAPI-generated — no new types to
  hand-write).
- `web/components/transfers/transfer-pair-card.tsx` — one matched pair: debit leg (bank,
  amount, time) ↔ credit leg, the time gap, a `cross_currency` badge where set, and the
  `reasons[]` rendered as a "why matched" list. This explainability payload is the IP made
  legible — render it prominently.
- `web/components/transfers/tier-group.tsx` — a collapsible section per tier (High / Medium)
  with a count badge.
- `web/components/transfers/dedup-summary-bar.tsx` — reuse the dashboard's before/after
  numbers (`before_after`: transfer volume, matched count, income/spending inflation %) as a
  header. Prefer extracting the shared bit from `web/components/cashflow-tiles.tsx` over
  duplicating it.

### Edits
- `web/app/(app)/transfers/page.tsx` — drop `<ComingSoon>`, keep the existing `<PageHeader>`,
  render summary bar + tier groups.
- `web/lib/nav.ts` — remove `comingSoon: true` on the Transfers entry.

### States to handle (copy the dashboard's approach)
- Loading skeleton.
- `EngineError` via `web/components/query-error.tsx`.
- **Empty state** — persona A has clean books, so no matches → "No phantom transfers — this
  ledger is already honest."

### Honesty feature
Surface `unmatched_candidate_count` as a muted "1 possible transfer we're not confident enough
to merge" row. That is persona B's known cross-currency FX gap (see the dedup FX note in
`backend-scaffold` memory) — showing it signals calibration, not overclaiming.

### Done when
Persona B shows its 8 matched pairs grouped by tier with reasons; persona A shows the empty
state; figures reconcile with the dashboard's before/after.

## Phase 2 — Confirm/reject feedback loop (the placeholder's full vision)

### Backend (one new seam, mirrors `api/audit.py`)
- `api/corrections.py` — a `CorrectionsLog` Protocol + `FileCorrectionsLog` writing append-only
  to `corrections.jsonl` (already gitignored and specced in CLAUDE.md). Copy the
  `AuditLog`/`FileAuditLog` shape.
- `api/routes.py` + `api/schemas.py` — `POST /users/{user_id}/corrections` taking
  `{match_id, verdict: "confirm"|"reject", ...}`; wire via `api/deps.py` like the audit log.
- `api/tests/test_corrections.py` — mirror `api/tests/test_trust.py`.

### Frontend
- Add confirm/reject actions to `transfer-pair-card` (focus on `medium` tier), using the
  existing `web/components/ui/confirm-dialog.tsx` for the reject path.
- A `useSubmitCorrection()` mutation in `dedup.ts` (TanStack `useMutation`) posting to the new
  endpoint, with optimistic local state.

### Done when
A medium-tier pair can be confirmed/rejected, the verdict lands in `corrections.jsonl`, and the
audit log reflects the action — closing the "auditable, user-corrected, retrain offline" loop.

## Routing & guardrails for the build
- Hand Phase 1 to the **Frontend Developer agent**. Steer it explicitly: **React/Next.js App
  Router + TanStack Query, not Laravel/Livewire**; reuse the existing `engine.ts` /
  `engine-types.ts` and the dashboard patterns; **no new DB, no invented numbers** — every
  figure comes from the engine response.
- Phase 2's backend touches a write path — run the **code-reviewer** before committing it.
- Two commits: Phase 1 (frontend explorer), then Phase 2 (feedback loop).

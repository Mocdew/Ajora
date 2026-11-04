# Ajora — Demo Script

**Zecathon 2025 · Team P4L.** A 3–5 minute live walkthrough of the product arc:
**naive inflated view → flip the dedup toggle → honest numbers → the communal insights
underneath → the trust/consent proof.**

> Verified against the real engine with all four persona API walkthroughs and the Emeka
> browser walkthrough on 2026-11-03.
> Every number below is live engine output, not slideware. Fallback screenshots for each
> beat are in [`demo-assets/`](demo-assets/) (referenced inline).
>
> Dockerfiles and Compose configuration exist. A container rehearsal requires a running
> Docker daemon; the native stack is covered by the automated browser walkthrough.
> Old screenshots/video predate the fee correction below; use the live application for current figures.

---

## The persona: **Emeka Balogun** (`u_persona_b`)

Chosen as the single most compelling persona — he's the only one strong on **both** IP
stages at once:

| Persona | Dedup headline | Communal story | Graph | Verdict |
|---|---|---|---|---|
| **Emeka (B)** ✅ | **Strong** — ₦1.39M phantom, income +24.9%, **spending +76.7%**, 8 transfers | ₦2.56M UK **remittance = 45.7% of net income** + black-tax dependent | 3 nodes | **Demo spine** |
| Funmilayo (C) | Weak — only 7.8%, 2 transfers | **All 4 patterns** (ajo, lending, dependent, remittance) | 4 nodes | Optional "breadth" beat |
| Adaeze (A) | Strong (28.3%) | **None** (empty communal) | 1 node | ❌ no communal payoff |

Lead with Emeka. His ₦2.56M remittance being **45.7% of his real income** is the single
most memorable line in the demo. If the room wants to see the *full* communal taxonomy
(rotating savings + informal lending), use the **optional breadth beat** (§ Optional) to
switch to Funmilayo for ~30s.

---

## Pre-flight (do this before you present)

1. **Start the engine** (from repo root). Select deterministic narration
   as below for the offline grounded stub
   (still real, grounded figures — just templated prose, labelled `stub-offline`).
   ```bash
   export AJORA_EXPLAINER=offline        # deterministic credential-free rehearsal
   .venv/bin/python -m uvicorn api.main:app --port 8000
   ```
2. **Start the web app** (second terminal). The browser calls a same-origin `/api/engine`
   proxy that forwards to `:8000` (`AJORA_API_BASE`), so there's no CORS to fight.
   ```bash
   cd web && npm run dev          # http://localhost:3100
   ```
3. **Open** http://localhost:3100/dashboard and **select "Persona B · Emeka Balogun"** in
   the top-bar switcher. The app's *default* persona is Adaeze (A), who has empty communal
   states — **switch to Emeka before you start talking.** (The choice persists in
   localStorage, so once set it sticks across reloads.)
4. **Reset consent to 4/4.** Go to **Settings** and make sure all four accounts (Access
   Bank, Domiciliary, GTBank, OPay) show **"Consent granted."** If a previous run left one
   revoked, click **Grant**. (Consent lives in the append-only `consent.jsonl`; revocations
   persist until re-granted.)
5. **Leave the dedup toggle OFF** (showing the raw, inflated view) — that's where the story
   opens.
6. Do one silent dry-run of the five clicks below so the ~1s number animations don't catch
   you mid-count.

---

## The script (≈ 4 minutes)

### Beat 1 — The problem: the inflated view (~40s)
**Screen:** Dashboard, dedup toggle **OFF**. → [`01-naive-inflated.jpg`](demo-assets/01-naive-inflated.jpg)

**Shows:** INCOME **₦6.99M**, SPENDING **₦3.21M**, both tagged *"Inflated by ₦1.39M phantom
transfers."* NET **₦3.78M**.

> "This is Emeka's money the way every bank aggregator shows it today: ₦6.99M of income,
> ₦3.21M of spending. The problem? Emeka banks across four apps — GTBank, Access, OPay, a
> domiciliary account — and he moves his own money between them constantly. Every aggregator
> counts that as **income on one side and spending on the other.** His numbers are inflated
> by a third, and no lender or budgeting tool knows it."

### Beat 2 — The fix: flip the toggle (~45s)
**Action:** Click **"Remove phantom transfers."** Pause ~1s for the numbers to animate down.
**Screen:** Dashboard, toggle **ON**. → [`02-deduped-honest.jpg`](demo-assets/02-deduped-honest.jpg)

**Shows:** INCOME **₦6.99M → ₦5.6M**, SPENDING **₦3.21M → ₦1.81M** (−76.7% inflation!),
NET **holds at ₦3.78M**.

> "One toggle. Our cross-institution matcher found **8 self-transfers** — ₦1.39M of phantom
> money — using the Hungarian algorithm over fuzzy name, amount and timing signals. Watch
> what happens: income falls to its real ₦5.6M, spending nearly halves. But look at **Net —
> it stays the same, because transfer fees remain real spending.** That's the tell: what was fake was never his balance, it was the
> *size* of each side. That inflation is exactly what misleads a loan officer."

### Beat 3 — Trust the number: grounded GenAI (~35s)
**Action:** Scroll down to **"Explained by Ajora AI ✓ grounded"** and the raw-vs-deduped chart.
**Screen:** → [`03-grounded-narration.jpg`](demo-assets/03-grounded-narration.jpg)

**Key figures in the narration:** *"Emeka, we found 8 transfer(s)… inflated your income by 24.9%. Your
real income is ₦5,595,250, not the ₦6,986,880 a naive view shows. The largest move,
₦300,000 from gtbank to access, is a high-confidence match (95%)."*

> "Every figure gets explained in plain language by the offline demo narrator — but note the **✓ grounded**
> badge. The templates explain numbers already computed by the engine. The optional live model follows the same contract. The numeric guard checks that quoted numbers occur in the engine facts; it does not prove every sentence is semantically correct. The largest transfer is selected by the engine before narration."

*(Quirk to mention only if asked: Emeka's chart shows before/after **bars** rather than a
monthly line, because his domiciliary account is in USD and we don't fabricate an FX-split
monthly series — the engine's honesty extends to the chart.)*

### Beat 4 — The edge: the invisible economy (~50s)
**Action:** Click **Communal** in the sidebar. Pause ~1s for cards to load, then scroll to
the graph.
**Screens:** [`04-communal-cards.jpg`](demo-assets/04-communal-cards.jpg) ·
[`05-relationship-graph.jpg`](demo-assets/05-relationship-graph.jpg)

**Shows:** **REMITTANCES ₦2.6M** received from Chioma Balogun (quarterly) — **45.7% of net
income**; **DEPENDENTS · BLACK TAX ₦250K** to Mama Emeka (monthly). Below: a Cytoscape
**relationship graph** — Emeka at center, teal "money-in" remittance edge, amber "money-out"
dependent edge, shaped/colored by relationship type.

> "Once the phantom noise is gone, Emeka's *real* financial life appears — the part generic
> tools are blind to. A ₦2.56M remittance from family abroad that is **46% of his real
> income.** Recurring 'black tax' support to his mother. We don't just total these — we map
> the **relationships**: who the money moves between, which way it flows, how often. This is
> Nigeria's invisible communal economy, made legible."

### Beat 5 — Why you can trust us: consent + audit (~55s)
**Action:** Click **Settings**. Point at **"4 / 4 accounts contributing."** Click **Revoke**
on **Domiciliary**, confirm in the dialog. Return to **Communal** (or Dashboard) — the
remittance is gone and figures recomputed. Then open **Audit**.
**Screens:** [`06-consent-accounts.jpg`](demo-assets/06-consent-accounts.jpg) ·
[`07-revoke-dialog.jpg`](demo-assets/07-revoke-dialog.jpg) ·
[`08-after-revoke-communal.jpg`](demo-assets/08-after-revoke-communal.jpg) ·
[`09-audit-log.jpg`](demo-assets/09-audit-log.jpg)

**Shows:** Revoking the Domiciliary account **live-removes the ₦2.6M remittance**, and the
dependent's share **recalculates 4.5% → 7.7%** (net income dropped). The Audit log — *"append-
only, never sold"* — records every read and literally lists **"Excluded by revoked consent:
domv-b04"** on every access made after the revoke.

> "And this is consent-first for real, not a checkbox. Emeka revokes his domiciliary account —
> and that ₦2.6M remittance **vanishes from every view instantly**, because revoked account data is excluded from the engine. The fixture demo loads local files; real provider consent must be enforced before bank fetching. We keep **no database** — nothing collected 'just in case.' The durable state is consent decisions, correction verdicts, and this **append-only audit log** that proves what we served and which revoked accounts were excluded from computation. Honest numbers, on data he controls, that he can walk back any second."

**Close (~15s):**
> "That's Ajora: strip the phantom inflation, surface the communal economy underneath, and do
> it all on consented, auditable, never-stored data. Thank you."

*(Remember to **re-Grant Domiciliary** afterward to reset to 4/4 for the next run.)*

---

## Optional — breadth beat (~30s, swap in after Beat 4)

If the audience wants the full communal taxonomy, use the **persona switcher** to jump to
**Funmilayo Adeyemi (C)** and stay on **Communal**:

> "Here is another labelled example. Here's a different customer — Ajora detects three further patterns: a
> rotating **ajo/esusu** savings group, an **informal loan** (₦50k lent, ₦30k still
> outstanding), and a dependent receiving support — each a node in her
> relationship graph."

Then switch back to Emeka if continuing. Note C's dedup headline is weak (7.8%), so **don't**
open the dedup story on her.

---

## Known quirks & gotchas (rehearsed)

- **Numbers animate ~1s on toggle/persona change** (`animated-naira`). Pause before reading a
  figure or a screenshot, or you'll catch an in-between value (e.g. ₦6.79M mid-count).
- **Default persona is Adaeze (A)** — empty communal. **Switch to Emeka first.**
- **Cards/graph load from the live engine** (brief skeletons). Give each route ~1s after
  navigating before you gesture at the data.
- **Emeka's chart = before/after bars**, not a monthly series (cross-currency USD ledger; the
  app refuses to invent an FX-split series). This is intentional honesty — mention only if
  asked. Adaeze/Funmilayo render the shaded monthly series if you prefer that visual.
- **Consent persists** in `consent.jsonl`. Always reset to 4/4 (Grant) before presenting.
- **Narration source:** with `ANTHROPIC_API_KEY` set it's live Claude (`generatedBy` = model
  id); without it, the deterministic grounded stub (`stub-offline`). Both are grounded; the
  live path adds a network dependency — for a high-stakes room, the stub is the safer choice.

## If it breaks — recovery

- **Dashboard/cards empty or spinning:** the engine (`:8000`) is down or the proxy can't reach
  it. Check `curl localhost:8000/health` → `{"status":"ok", ...}`. Restart uvicorn.
- **404 / "No data for user":** wrong persona id — reselect from the switcher.
- **Numbers look wrong / an account missing:** a left-over revoke. Settings → Grant everything
  back to 4/4.
- **Total failure:** fall back to the screenshot walkthrough — [`demo-assets/`](demo-assets/)
  `01…09` are exactly the five beats in order; narrate them with the talk track above.

## Reference figures (Emeka, live engine)

| | Naive | Deduped |
|---|---|---|
| Income | ₦6,986,880 | ₦5,595,250 |
| Spending | ₦3,205,100 | ₦1,813,470 |
| Net | ₦3,781,780 | ₦3,781,780 |
| Phantom removed | — | ₦1,391,630 over 8 transfers |
| Inflation | — | income 24.9% · spending 76.7% |

Communal: Remittance ₦2,557,500 (Chioma Balogun, quarterly, 45.7% of net) · Dependent
₦250,000 (Mama Emeka, monthly, 4.5%). Accounts: `access-b02`, `domv-b04`, `gtb-b01`,
`opay-b03`.

## Fee and review proof (optional 30 seconds)

Open Transfers. High confidence pairs apply automatically; medium pairs stay in income/spending pending confirmation; low pairs are left untouched. Confirm/reject decisions apply to subsequent cashflow, graph and narration reads and survive restart in `corrections.jsonl`. Re-confirm any rejected pair after demonstrating.

The ₦870 difference between Emeka's transfer debit and credit legs stays in spending (fees/FX settlement); dedup therefore preserves net cashflow. FX uses demo rates, not current market quotes.

## Automated rehearsal

Run the Python suite and browser walkthrough described in RUNNING.md. Browser checks use isolated temporary state. Reset regular demo consent with Settings → Grant and restore any rejected transfer verdicts; do not delete existing audit files.

Validation: 94 Python tests, both precision/recall harnesses, five offline explainer cases, frontend lint/type/build, and the full Emeka browser walkthrough passed. Screenshots are produced under `web/test-results/`; CI uploads them as a walkthrough artifact.

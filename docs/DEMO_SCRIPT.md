# Ajora — Demo Script

**Zecathon 2025 · Team P4L.** A 3–5 minute live walkthrough of the product arc:
**naive inflated view → flip the dedup toggle → honest numbers → the communal insights
underneath → the trust/consent proof.**

> Rehearsed end-to-end against the real engine on the labelled personas (2026-10-11).
> Every number below is live engine output, not slideware. Fallback screenshots for each
> beat are in [`demo-assets/`](demo-assets/) (referenced inline).
>
> ⚠️ **Not yet rehearsed against a Docker build** — no container setup exists in the repo
> yet. This script targets the local stack; re-run the pre-flight against the Docker build
> once it lands (the flow and talk track don't change, only how you start the servers).

---

## The persona: **Emeka Balogun** (`u_persona_b`)

Chosen as the single most compelling persona — he's the only one strong on **both** IP
stages at once:

| Persona | Dedup headline | Communal story | Graph | Verdict |
|---|---|---|---|---|
| **Emeka (B)** ✅ | **Strong** — ₦1.39M phantom, income +24.9%, **spending +76.8%**, 8 transfers | ₦2.56M UK **remittance = 45.7% of net income** + black-tax dependent | 3 nodes | **Demo spine** |
| Funmilayo (C) | Weak — only 7.8%, 2 transfers | **All 4 patterns** (ajo, lending, dependent, remittance) | 4 nodes | Optional "breadth" beat |
| Adaeze (A) | Strong (28.3%) | **None** (empty communal) | 1 node | ❌ no communal payoff |

Lead with Emeka. His ₦2.56M remittance being **45.7% of his real income** is the single
most memorable line in the demo. If the room wants to see the *full* communal taxonomy
(rotating savings + informal lending), use the **optional breadth beat** (§ Optional) to
switch to Funmilayo for ~30s.

---

## Pre-flight (do this before you present)

1. **Start the engine** (from repo root). For the authentic GenAI story, export your key
   first so narration comes from the live model; skip it to use the offline grounded stub
   (still real, grounded figures — just templated prose, labelled `stub-offline`).
   ```bash
   export ANTHROPIC_API_KEY=sk-...        # optional — live Claude narration
   .venv/bin/python -m uvicorn api.main:app --port 8000
   ```
2. **Start the web app** (second terminal). The browser calls a same-origin `/api/engine`
   proxy that forwards to `:8000` (`AJORA_API_BASE`), so there's no CORS to fight.
   ```bash
   cd web && npm run dev          # http://localhost:3000
   ```
3. **Open** http://localhost:3000/dashboard and **select "Persona B · Emeka Balogun"** in
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

**Shows:** INCOME **₦6.99M → ₦5.6M**, SPENDING **₦3.21M → ₦1.81M** (−76.8% inflation!),
NET **holds at ₦3.78M**.

> "One toggle. Our cross-institution matcher found **8 self-transfers** — ₦1.39M of phantom
> money — using the Hungarian algorithm over fuzzy name, amount and timing signals. Watch
> what happens: income falls to its real ₦5.6M, spending nearly halves. But look at **Net —
> it barely moves.** That's the tell: what was fake was never his balance, it was the
> *size* of each side. That inflation is exactly what misleads a loan officer."

### Beat 3 — Trust the number: grounded GenAI (~35s)
**Action:** Scroll down to **"Explained by Ajora AI ✓ grounded"** and the raw-vs-deduped chart.
**Screen:** → [`03-grounded-narration.jpg`](demo-assets/03-grounded-narration.jpg)

**Shows (verbatim):** *"Emeka, we found 8 transfer(s)… inflated your income by 24.9%. Your
real income is ₦5,595,250, not the ₦6,986,880 a naive view shows. The largest move,
₦200,000 from gtbank to opay, is a high-confidence match (98%)."*

> "Every figure gets explained in plain language by Claude — but note the **✓ grounded**
> badge. The model *explains* the numbers; it never computes them. Every value in that
> sentence is verified against the engine's output before it's shown — if the model ever
> invented a figure, we'd catch it and refuse to display it. No hallucinated naira."

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
> and that ₦2.6M remittance **vanishes from every view instantly**, because revoked data never
> reaches the engine. We keep **no database** — nothing collected 'just in case.' The only
> thing we persist is this **append-only audit log** that proves what we read and what we
> deliberately left out. Honest numbers, on data he controls, that he can walk back any second."

**Close (~15s):**
> "That's Ajora: strip the phantom inflation, surface the communal economy underneath, and do
> it all on consented, auditable, never-stored data. Thank you."

*(Remember to **re-Grant Domiciliary** afterward to reset to 4/4 for the next run.)*

---

## Optional — breadth beat (~30s, swap in after Beat 4)

If the audience wants the full communal taxonomy, use the **persona switcher** to jump to
**Funmilayo Adeyemi (C)** and stay on **Communal**:

> "And it generalizes. Here's a different customer — Ajora detects **all four** patterns: a
> rotating **ajo/esusu** savings group, an **informal loan** (₦50k lent, ₦30k still
> outstanding), a dependent paying school fees, and a remittance — each a node in her
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
| Spending | ₦3,205,100 | ₦1,812,600 |
| Net | ₦3,781,780 | ₦3,782,650 |
| Phantom removed | — | ₦1,392,065 over 8 transfers |
| Inflation | — | income 24.9% · spending 76.8% |

Communal: Remittance ₦2,557,500 (Chioma Balogun, quarterly, 45.7% of net) · Dependent
₦250,000 (Mama Emeka, monthly, 4.5%). Accounts: `access-b02`, `domv-b04`, `gtb-b01`,
`opay-b03`.

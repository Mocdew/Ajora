# Ajora GenAI Explainer — Grounding Contract

**Scope:** transfer dedup and communal-finance narration for the consented ledger.

The explainer's one job: turn Ajora's **already-computed** structured insight objects
into clear, trustworthy prose. **The engine computes every number; Claude only explains
numbers that are already in the insight object.** This document is the authoritative
statement of *what data the prompt may use* and *the rules that keep it grounded*.

---

## 1. Narration source

The demo uses deterministic templates without credentials. Set `AJORA_EXPLAINER=offline`
to force this mode even when an Anthropic key is present. With the optional Anthropic
adapter enabled, the API checks the model output against the same facts. An SDK failure,
incomplete response, or failed grounding check regenerates the entire response offline.
`generatedBy` reports the actual source.

---

## 2. What the prompt may use (the data boundary)

The dedup prompt is built from the `facts` dict produced by [`build_facts`](facts.py)
from a `DedupResult` and `UserProfile`. The communal prompt uses a separate
[projection](communal.py) for each relationship, including the counterparty, cadence,
settled amounts and share of income. Neither prompt receives the raw ledger.

```jsonc
{
  "currency": "NGN",
  "user_first_name": "Stephen",          // tone only, never a number
  "match_count": 3,
  "distinct_institutions": 3,
  "unmatched_candidate_count": 0,
  "totals": {                            // the headline figures, from engine `Totals`
    "gross_income", "gross_spending",
    "transfer_volume",
    "net_income", "net_spending",
    "income_inflation_pct", "spending_inflation_pct"
  },
  "transfers": [                         // one per transfer actually removed
    { "amount", "currency", "fee", "confidence_pct", "tier", "largest"?,
      "from_bank", "to_bank", "reasons": [ "...human-readable..." ] }
  ]
}
```

**Deliberately excluded from the prompt:**

- **Eval-only ground truth — `transfer_pair_id`, `communal_tag`.** These exist only in
  the labelled fixture so the eval harness can score precision/recall. The engine must
  not read them and the explainer must never see or mention them. `build_facts`
  constructs the dict **field by field** (never `model_dump()`), so these cannot leak
  even if a future schema change stops marking them `exclude=True`. A belt-and-braces
  forbidden-term check (§4) backs this up.
- **PII / raw record detail:** transaction ids, account ids, raw narration, running
  balances, timestamps. The explanation talks about money and banks, not records.
- **Model internals / scoring math:** raw `score` floats are surfaced only as a rounded
  `confidence_pct`; weights, feature vectors, thresholds are not exposed.

---

## 3. Grounding rules (stated to the model)

See `SYSTEM_PROMPT` ([`prompt.py`](prompt.py)):

1. Use **only** the data inside the `<facts>` block. Treat nothing else as true.
2. **Never invent, estimate, re-round, or compute a new number.** Every figure in the
   explanation must appear verbatim in `<facts>`. No adding, subtracting, averaging, or
   currency conversion.
3. If a figure isn't in `<facts>`, don't mention it. Prefer saying less to guessing.
4. Quote money with its currency and the **full** figure (`₦1,250,000`), never
   abbreviated (`1.25m`, "about 1.3 million").
5. Never reveal internal/technical fields, confidence math, pair ids, or any
   classification label not present in `<facts>`.
6. If no pairs were removed, say that there is no transfer adjustment. Call a move
   the largest only when its facts mark it as such.

Style: lead with real (net) vs. inflated (gross) income/spending and *why* the gross
misled; 2–4 short second-person sentences; honest about high/medium/low confidence.

---

## 4. Enforcement — grounding is checked, not trusted

Rules in a prompt are necessary but not sufficient. [`grounding.py`](grounding.py) runs
two mechanical checks over the model's output, and [`Explainer`](explainer.py) applies
them on every call (raising `UngroundedExplanation` in strict mode — the production
default):

- **Number traceability.** Extract every numeric magnitude from the explanation. Each
  must match (±0.01) a number in the *allowed set* derived from the same facts dict by
  [`collect_allowed_numbers`](facts.py) — which also harvests numbers embedded in
  human-readable `reasons` strings. Any number not in the set is a hallucination.
- **No forbidden terms.** The output must not contain eval-only vocabulary
  (`transfer_pair_id`, `communal_tag`, and the communal tag values `ajo`, `esusu`,
  `ajo_payout`, `dependent`, `informal_loan_out`, `loan_repayment`, `remittance_in`).

**Input/output contract:**

```
Explainer(client, model=DEFAULT_MODEL).explain(result: DedupResult, user: UserProfile,
                                                strict=True) -> ExplanationResult
    .text       : str                 # the user-facing explanation
    .facts      : dict                # exactly what the prompt was grounded on (auditable)
    .grounding  : GroundingReport      # .ok, .ungrounded_numbers, .forbidden_hits
```

The `client` is injected (the `ExplainerClient` protocol). Production injects
`AnthropicExplainerClient`; the eval harness injects a deterministic offline stub. The
grounding guardrail is identical for both.

---

## 5. Eval harness

- **Cases & checks:** [`eval.py`](eval.py) — golden `insight -> explanation` cases
  (a strong 3-transfer dedup, a zero-match clean account) plus "teeth" checks proving
  the verifier *rejects* a fabricated figure and a leaked label, and *accepts* grounded
  text. Each golden case asserts: grounded, required headline figures present, no leaks.
- **Runs offline** against the stub (no API key, no network) so it can gate CI. If
  `ANTHROPIC_API_KEY` + the `anthropic` SDK are present it *also* runs the golden cases
  through the live model and reports (does not gate on) the result.

```bash
# from backend/
../.venv/bin/python -m scripts.run_explainer_eval      # human-readable report
../.venv/bin/python -m pytest tests/test_explainer.py -q
```

---

## 6. Limits

The guardrail checks numeric membership and excluded terms. It cannot verify that
a live model linked each supplied number to the right person, unit, or fact.
The offline demo renders those associations directly from the structured fields.

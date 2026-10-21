# Resolved: unify the engine on the float `Transaction` model

**Status:** resolved — option (2).
**Raised:** 2026-10-10.
**Resolved:** 2026-10-20.

## Decision

The sole engine transaction model is the float-backed
`engine.schemas.transaction.Transaction`. It is re-exported unambiguously as
`engine.Transaction`; there is no second package-root model.

The orphaned Decimal spine was removed:

- `engine/models.py`
- `engine/grouping.py`
- the top-level `data/` package and fixtures
- the top-level `tests/` spine tests
- the `data` package and `tests` testpath entries in `pyproject.toml`

## Why float

`Decimal` is generally preferable for money, but it was not a concrete reason to prefer
this spine over the live track:

- every dedup, communal, explainer, API, backend, and harness consumer already uses the
  float model;
- the Decimal model is orphaned from the product and has a different field vocabulary,
  so choosing it would require a product-wide migration rather than a type swap;
- no observed defect demonstrated a Decimal-specific correctness benefit; and
- keeping both models made `from engine import Transaction` silently resolve to the
  unused implementation.

Binary floating-point rounding remains a known trade-off, especially for money totals
and threshold comparisons. Exact monetary arithmetic should be handled later as one
atomic migration of the live schema and all consumers, not by restoring a parallel
track.

## Resolution checks

Verified on 2026-10-20 after the deletion:

- `from engine import Transaction` resolves to
  `engine.schemas.transaction.Transaction`, whose `amount` annotation is `float`.
- The full root suite passes: **80 tests** across engine, API, and backend.
- The dedup harness reports aggregate precision/recall/F1 of **1.0**.
- The communal harness reports per-class precision/recall/F1 and insight detection
  precision/recall of **1.0**.

The ten top-level spine tests were intentionally removed with their implementation.

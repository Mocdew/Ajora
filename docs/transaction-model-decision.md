# Open decision: unify the two `Transaction` models

**Status:** open — needs a call from the team (owner of the Decimal spine to weigh in).
**Raised:** 2026-10-10.

`engine/` currently holds **two incompatible `Transaction` models** that do not bridge.
This is an architecture decision, not a cleanup: whichever model we standardize on, the
other track gets deleted.

## The two tracks

### Track A — live core-IP track (`float`)
`engine/schemas/transaction.py`. The entire product runs on it:

- all of `engine/dedup` and `engine/communal`
- both harnesses (`engine.harness`, `engine.communal_harness`)
- the backend explainer (`backend/app/explainer/*`)
- every dedup/communal test

`backend/app/dedup` and `backend/app/schemas` are thin re-export shims onto this track.

### Track B — orphaned spine (`Decimal`)
`engine/models.py` + `engine/grouping.py` + top-level `data/` (loader / provider /
adapters + `data/mock/persona_{1,2}.json`) + top-level `tests/` (`test_loader`,
`test_provider`).

Imported by **nothing** in the dedup/communal/explainer pipeline — only by its own two
tests. A parallel track that is currently unused by the product.

## The real question

Not "delete the stale one" — it's **which model the product standardizes on**, then
delete the loser.

## Trade-off

`Decimal` is the correct type for money. `float` introduces rounding error in sums and
threshold comparisons, which directly affects the dedup amount-feasibility gates and the
before/after totals. So **Track B is arguably the model to keep**, even though it is the
one currently unused.

But migrating onto it is a real refactor, not a cleanup: the dedup scorer/similarity, the
communal classifier/graph, and the explainer `build_facts` all read fields off the float
model.

## Two coherent end states

1. **Unify on Decimal (recommended direction).** Migrate the engine onto
   `engine/models.py`; drop `engine/schemas/transaction.py`. Correct money type; larger
   change.
2. **Unify on float.** Drop `engine/models.py`, `engine/grouping.py`, `data/`, `tests/`,
   and the `data` entry in `pyproject.toml [tool.setuptools] packages`. Smaller change;
   keeps the wrong money type.

Do not unilaterally delete either track — confirm with the teammate who wrote the spine
first.

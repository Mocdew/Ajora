"""The engine MUST NOT consult the eval-only ground-truth fields.

``transfer_pair_id`` and ``communal_tag`` exist only so the harness can score; a real
bank feed never supplies them. We prove the engine is blind to them two ways:

1. **Serialization**: both fields are ``exclude=True`` — they never appear in a
   ``model_dump()`` the engine/API path would serialize.
2. **Invariance**: scrambling every label (and blanking the others) does not change a
   single predicted pair. If the engine read them, the output would move.
"""

from __future__ import annotations

from engine.dedup.engine import DedupEngine


def _pred_pairs(batch):
    r = DedupEngine().dedup(batch.transactions, batch.user)
    return {frozenset({m.debit.id, m.credit.id}) for m in r.matches}


def test_eval_fields_are_excluded_from_serialization(persona_batches):
    for batch in persona_batches.values():
        for t in batch.transactions:
            dumped = t.model_dump()
            assert "transfer_pair_id" not in dumped
            assert "communal_tag" not in dumped
            dumped_json = t.model_dump(mode="json")
            assert "transfer_pair_id" not in dumped_json
            assert "communal_tag" not in dumped_json


def test_predictions_are_invariant_to_label_scrambling(persona_batches):
    for name, batch in persona_batches.items():
        baseline = _pred_pairs(batch)

        # Rebuild every transaction with the eval-only labels corrupted: give them all
        # the SAME transfer_pair_id (so, if read, everything would look like one giant
        # transfer group) and a bogus communal_tag. Frozen models => copy with updates.
        scrambled_txns = [
            t.model_copy(update={"transfer_pair_id": "SCRAMBLED", "communal_tag": "ajo"})
            for t in batch.transactions
        ]
        scrambled_batch = batch.model_copy(update={"transactions": scrambled_txns})

        assert _pred_pairs(scrambled_batch) == baseline, name

        # And the opposite: strip all labels to None — still identical.
        stripped_txns = [
            t.model_copy(update={"transfer_pair_id": None, "communal_tag": None})
            for t in batch.transactions
        ]
        stripped_batch = batch.model_copy(update={"transactions": stripped_txns})
        assert _pred_pairs(stripped_batch) == baseline, name

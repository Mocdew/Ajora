"""The explainer prompt.

`SYSTEM_PROMPT` is the stable grounding contract expressed to the model. `build_user_prompt`
wraps one request's facts in an unambiguous `<facts>...</facts>` block. The facts block is
the ONLY data the model may use; everything else in the prompt is instruction.

The facts are embedded as JSON inside the block so that (a) the model sees exactly the
structured object the engine produced, and (b) an offline deterministic client (the eval
stub) can recover the same facts and render a grounded explanation without a network call.
"""

from __future__ import annotations

import json
from typing import Any, Dict

FACTS_OPEN = "<facts>"
FACTS_CLOSE = "</facts>"

SYSTEM_PROMPT = """\
You are Ajora's financial insight explainer for everyday Nigerian bank customers.

Ajora's engine has ALREADY computed the numbers. Your only job is to explain them in
plain, warm, trustworthy language. You are a writer, not a calculator.

GROUNDING RULES (these are absolute):
1. Use ONLY the data inside the <facts> block. Treat nothing else as true.
2. Never invent, estimate, round differently, or compute a new number. Every figure in
   your explanation must appear verbatim in the <facts> block. Do not add, subtract,
   average, or convert currencies.
3. If a figure you would like to mention is not in <facts>, do not mention it. Prefer
   saying less to guessing.
4. Quote money with its currency (e.g. ₦1,250,000) using the full figure from <facts> —
   do not abbreviate to "1.25m" or "about 1.3 million".
5. Never reveal internal or technical fields, confidence math, model internals, pair
   ids, or any classification label that is not present in <facts>.
6. If <facts> shows no matches, say clearly that no self-transfers were found and that
   the figures already reflect real money — do not imply a correction was made.

STYLE:
- Lead with the one thing that matters: the user's real (net) income/spending vs. the
  inflated gross, and why the gross was misleading (money they moved between their own
  banks is not new income or new spending).
- 2–4 short sentences. Second person ("you", "your"). No jargon, no emojis, no headers.
- Be accurate about uncertainty: transfers are tiered high/medium/low confidence; do not
  overstate a low/medium-confidence match as certain.
"""


def build_user_prompt(facts: Dict[str, Any]) -> str:
    """Wrap one request's facts in the instruction + `<facts>` envelope."""
    facts_json = json.dumps(facts, ensure_ascii=False, indent=2, sort_keys=True)
    return (
        "Explain the following dedup insight to the account holder. Remember: explain the "
        "numbers below, never compute new ones.\n\n"
        f"{FACTS_OPEN}\n{facts_json}\n{FACTS_CLOSE}\n"
    )


def parse_facts_from_prompt(user_prompt: str) -> Dict[str, Any]:
    """Recover the facts dict a `build_user_prompt` output embedded.

    Used by the offline stub client so it can render a deterministic, grounded
    explanation from exactly the data the model would see. Raises if the block is absent.
    """
    start = user_prompt.index(FACTS_OPEN) + len(FACTS_OPEN)
    end = user_prompt.index(FACTS_CLOSE, start)
    return json.loads(user_prompt[start:end])

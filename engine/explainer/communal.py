"""Grounded narration for communal-finance insights.

The dedup explainer (`explainer.py`) narrates a `DedupResult`; this narrates a single
`CommunalInsight` (one ajo/esusu, dependent, informal-lending, or remittance
relationship). It reuses the same grounding machinery — every number in the narration
must be traceable to the insight's own figures — but with its OWN facts projection,
prompt, and forbidden list: the dedup path forbids the words "ajo"/"dependent"/… (they
are eval-only leak-guards there), whereas here those words are the legitimate subject.

Offline (no API key) a deterministic stub renders the narration from the facts, so the
output is grounded by construction and the demo needs no credentials. A live client gets
the same facts via the `<facts>` prompt envelope and its output is grounding-checked the
same way.
"""

from __future__ import annotations

from typing import Any, Dict

from ..schemas.communal import CommunalInsight
from ..schemas.transaction import UserProfile
from .client import ExplainerClient, StubExplainerClient
from .explainer import ExplanationResult, UngroundedExplanation
from .facts import collect_allowed_numbers
from .grounding import verify_grounded
from .prompt import FACTS_CLOSE, FACTS_OPEN

# Human-readable label per relationship type (we never print the raw snake_case token).
RELATIONSHIP_LABELS: Dict[str, str] = {
    "ajo_esusu": "ajo/esusu savings group",
    "dependent": "regular support",
    "informal_lending": "informal loan",
    "remittance": "remittance",
}

# Internal / eval-only tokens that must never surface in user-facing communal text.
# NB: unlike the dedup explainer, "ajo"/"dependent"/"remittance" are allowed here.
COMMUNAL_FORBIDDEN = (
    "transfer_pair_id",
    "communal_tag",
    "ajo_payout",
    "informal_loan_out",
    "loan_repayment",
    "remittance_in",
    "net_position_ngn",
    "pct_of_net_income",
)

COMMUNAL_SYSTEM_PROMPT = """\
You are Ajora's financial insight explainer for everyday Nigerian bank customers.

Ajora's engine has ALREADY identified this relationship and computed the numbers. Your
only job is to explain one communal-finance relationship in plain, warm language. You are
a writer, not a calculator.

GROUNDING RULES (absolute):
1. Use ONLY the data inside the <facts> block. Treat nothing else as true.
2. Never invent, estimate, round differently, or compute a new number. Every figure must
   appear verbatim in <facts>. Do not add, subtract, average, or convert.
3. If a figure is not in <facts>, do not mention it. Prefer saying less to guessing.
4. Quote money with its currency (e.g. ₦120,000) using the full figure from <facts>.
5. Do not reveal internal field names or classification codes.

STYLE:
- 2–3 short sentences, second person ("you", "your"). Warm, concrete, no jargon, no emojis.
- Name the counterparty and what the relationship is (a savings group, steady support, a
  loan, a remittance), how often, and its share of real income when given.
- For a loan, be clear about what is still owed to the user.
"""


def _first_name(full_name: str) -> str:
    parts = [p for p in full_name.strip().split() if p]
    return parts[0] if parts else ""


def _money(value: float) -> str:
    v = float(value)
    return "{:,.0f}".format(v) if v == int(v) else "{:,.2f}".format(v)


def _pct(value: float) -> str:
    return "%g" % float(value)


def build_communal_facts(insight: CommunalInsight, user: UserProfile) -> Dict[str, Any]:
    """Project one `CommunalInsight` into the grounded facts the narration may use.

    Built by hand (not ``model_dump``) so only the whitelisted, non-PII fields reach the
    prompt. ``kind`` marks this as a communal request for the offline stub.
    """
    return {
        "kind": "communal",
        "currency": "NGN",
        "user_first_name": _first_name(user.full_name),
        "counterparty": insight.counterparty,
        "relationship_label": RELATIONSHIP_LABELS.get(
            insight.relationship_type, "relationship"
        ),
        "relationship_type": insight.relationship_type,
        "cadence": insight.cadence,
        "count": insight.count,
        "months_active": insight.months_active,
        "total_out_ngn": round(insight.total_out_ngn, 2),
        "total_in_ngn": round(insight.total_in_ngn, 2),
        "net_position_ngn": round(insight.net_position_ngn, 2),
        "pct_of_net_income": round(insight.pct_of_net_income, 2),
    }


def build_communal_user_prompt(facts: Dict[str, Any]) -> str:
    import json

    facts_json = json.dumps(facts, ensure_ascii=False, indent=2, sort_keys=True)
    return (
        "Explain the following communal-finance relationship to the account holder. "
        "Explain the numbers below, never compute new ones.\n\n"
        f"{FACTS_OPEN}\n{facts_json}\n{FACTS_CLOSE}\n"
    )


def render_communal_stub(facts: Dict[str, Any]) -> str:
    """Deterministic, grounded narration from the facts (offline path).

    Only ever cites numbers present in ``facts``, so it passes the grounding check by
    construction.
    """
    name = facts.get("user_first_name") or ""
    hello = f"{name}, " if name else ""
    who = facts["counterparty"]
    cadence = facts["cadence"]
    count = facts["count"]
    out = facts["total_out_ngn"]
    inn = facts["total_in_ngn"]
    net = facts["net_position_ngn"]
    pct = facts["pct_of_net_income"]
    rtype = facts["relationship_type"]

    share = (
        f" That is about {_pct(pct)}% of your real income."
        if pct and pct > 0
        else ""
    )

    if rtype == "ajo_esusu":
        base = (
            f"{hello}you contribute to an ajo/esusu savings group with {who} — "
            f"{count} contribution(s) totalling ₦{_money(out)}."
        )
        if inn and inn > 0:
            base += f" You have received ₦{_money(inn)} back in payout(s)."
        return base + share

    if rtype == "dependent":
        return (
            f"{hello}you regularly support {who} — {count} transfer(s) totalling "
            f"₦{_money(out)} on a {cadence} basis. This is steady, recurring support, "
            f"not one-off spending.{share}"
        )

    if rtype == "informal_lending":
        return (
            f"{hello}you lent money to {who}: ₦{_money(out)} out and ₦{_money(inn)} "
            f"repaid so far, leaving ₦{_money(net)} still owed to you. Ajora tracks this "
            f"as a loan rather than spending, so your real position is not understated."
        )

    if rtype == "remittance":
        return (
            f"{hello}you receive remittances from {who} — {count} transfer(s) totalling "
            f"₦{_money(inn)} on a {cadence} basis.{share}"
        )

    # Fallback (shouldn't happen: the four types above are exhaustive).
    return (
        f"{hello}Ajora detected a recurring money relationship with {who}: "
        f"{count} transfer(s), ₦{_money(out)} out and ₦{_money(inn)} in.{share}"
    )


class CommunalExplainer:
    """Narrates one `CommunalInsight`, grounding-checked like the dedup explainer.

    Offline (a `StubExplainerClient`) renders deterministically; any other client is
    prompted with the `<facts>` envelope. Either way the output is verified against the
    insight's own numbers.
    """

    def __init__(self, client: ExplainerClient) -> None:
        self.client = client

    def explain(
        self, insight: CommunalInsight, user: UserProfile, strict: bool = True
    ) -> ExplanationResult:
        facts = build_communal_facts(insight, user)

        if isinstance(self.client, StubExplainerClient):
            text = render_communal_stub(facts).strip()
        else:
            prompt = build_communal_user_prompt(facts)
            text = self.client.explain(COMMUNAL_SYSTEM_PROMPT, prompt).strip()

        allowed = collect_allowed_numbers(facts)
        report = verify_grounded(text, allowed, forbidden_terms=COMMUNAL_FORBIDDEN)

        if strict and not report.ok:
            raise UngroundedExplanation(report, text)
        return ExplanationResult(text=text, facts=facts, grounding=report)

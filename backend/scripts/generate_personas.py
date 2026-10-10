"""Deterministic generator for the labelled persona dataset (Ajora demo + eval data).

    python -m scripts.generate_personas        # from the backend/ directory

Writes `data/mock/persona_a.json`, `persona_b.json`, `persona_c.json`, each a
`TransactionBatch` ({"user": {...}, "transactions": [...]}) loadable by
`datasets.load_batch`. The output is the test fixture AND the demo data for both ML
stages: cross-institution transfer dedup and communal-finance classification.

No database — this just emits files (per the stateless, compute-ephemerally architecture).
Everything is seeded, so regenerating reproduces byte-identical files.

Ground-truth labels (eval-only, `exclude=True` on the schema, never read by the engine):
  - `transfer_pair_id`: both legs of one self-transfer share this id.
  - `communal_tag`: one of ajo / ajo_payout / dependent / informal_loan_out /
    loan_repayment / remittance_in.

Design notes for the dedup eval:
  * Genuine income/expense carry no labels so precision is measurable.
  * Self-transfer legs share a NIP-style reference (strongest match signal) except a
    couple of name-only pairs that exercise the weighted scorer.
  * The cross-currency self-transfer (USD domiciliary -> NGN) is labelled but is EXPECTED
    to be missed by the amount-based engine — a real recall gap the fixture must expose.
  * Hard negatives: genuine third-party payments close in amount/timing to a real
    self-transfer, which the global (Hungarian) assignment must leave unmatched.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from app.datasets import MOCK_DIR


class Builder:
    """Accumulates transactions for one persona, emitting them in chronological order
    so every account's timestamps stay monotonically increasing by construction."""

    def __init__(self, user: dict) -> None:
        self.user = user
        self.txns: list[dict] = []
        self._n = 0

    def _id(self, prefix: str) -> str:
        self._n += 1
        return f"{prefix}{self._n:03d}"

    def add(
        self,
        account_id: str,
        institution: str,
        amount: float,
        direction: str,
        ts: datetime,
        narration: str,
        *,
        currency: str = "NGN",
        counterparty_name: Optional[str] = None,
        reference: Optional[str] = None,
        raw_category: Optional[str] = None,
        transfer_pair_id: Optional[str] = None,
        communal_tag: Optional[str] = None,
        id_prefix: str = "t",
    ) -> dict:
        rec = {
            "id": self._id(id_prefix),
            "account_id": account_id,
            "institution": institution,
            "amount": round(amount, 2),
            "currency": currency,
            "direction": direction,
            "timestamp": ts.isoformat(),
            "narration": narration,
        }
        if counterparty_name is not None:
            rec["counterparty_name"] = counterparty_name
        if reference is not None:
            rec["reference"] = reference
        if raw_category is not None:
            rec["raw_category"] = raw_category
        rec["transfer_pair_id"] = transfer_pair_id
        rec["communal_tag"] = communal_tag
        self.txns.append(rec)
        return rec

    def self_transfer(
        self,
        pair_id: str,
        *,
        debit_acct: str,
        debit_inst: str,
        credit_acct: str,
        credit_inst: str,
        amount: float,
        fee: float,
        ts: datetime,
        settle_minutes: int,
        ref: Optional[str],
        user_label: str,
        user_alias: str,
    ) -> None:
        """Emit the two mirror legs of one self-transfer. The credit equals the debit
        minus `fee` (a small NIP fee), and lands `settle_minutes` after the debit.
        If `ref` is given it is embedded on both legs (near-certain match); otherwise the
        pair matches on name + amount + timing only (weighted-scorer path)."""
        dnar = f"TRF/{user_label}/to self {debit_inst.upper()}-{credit_inst.upper()}"
        cnar = f"Transfer from {user_alias}"
        if ref:
            dnar += f"/REF:{ref}"
            cnar += f" Ref {ref}"
        self.add(
            debit_acct, debit_inst, amount, "debit", ts, dnar,
            counterparty_name=user_label, reference=ref,
            raw_category="transfer", transfer_pair_id=pair_id, id_prefix="st",
        )
        self.add(
            credit_acct, credit_inst, amount - fee, "credit",
            ts + timedelta(minutes=settle_minutes), cnar,
            counterparty_name=user_alias, reference=ref,
            raw_category="transfer", transfer_pair_id=pair_id, id_prefix="st",
        )

    def dump(self, path: Path) -> None:
        batch = {"user": self.user, "transactions": self.txns}
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(batch, indent=2) + "\n", encoding="utf-8")


def _month(base: datetime, m: int) -> datetime:
    """base shifted by m whole months (approx, 30-day steps are fine for a fixture)."""
    year = base.year + (base.month - 1 + m) // 12
    month = (base.month - 1 + m) % 12 + 1
    return base.replace(year=year, month=month)


# ---------------------------------------------------------------------------------------
# Persona A — salaried multi-bank earner (GTBank + Kuda). Salary lands in GTBank; the user
# sweeps part to Kuda every month. Clean dedup story: self-transfers + genuine spend only.
# ---------------------------------------------------------------------------------------

def build_persona_a() -> Builder:
    user = {
        "user_id": "u_persona_a",
        "full_name": "Adaeze Okonkwo",
        "aliases": ["Adaeze N Okonkwo", "Okonkwo Adaeze"],
        "account_ids": ["gtb-a01", "kuda-a02"],
    }
    b = Builder(user)
    base = datetime(2026, 5, 1, 0, 0)
    NAME, ALIAS = "ADAEZE OKONKWO", "ADAEZE N OKONKWO"

    # per-month sweep: amount, fee, whether to use a shared reference
    sweeps = [
        (150000, 0, "920451100087"),       # exact match, ref
        (120000, 25, "920451100310"),      # fee-net, ref
        (100000, 0, None),                 # exact, name-only (weighted path, no ref)
        (180000, 15, "920451100742"),      # fee-net, ref
        (90000, 0, "920451100955"),        # exact, ref
    ]

    for m in range(5):
        mb = _month(base, m)
        # Salary credit into GTBank (genuine income)
        b.add("gtb-a01", "gtbank", 450000, "credit", mb.replace(day=1, hour=8),
              "SALARY MAY ANDELA NIGERIA LTD" if m == 0 else
              f"SALARY {mb.strftime('%b').upper()} ANDELA NIGERIA LTD",
              raw_category="salary")
        # Sweep part to Kuda a day later (self-transfer)
        amt, fee, ref = sweeps[m]
        b.self_transfer(
            f"A-SW{m+1}",
            debit_acct="gtb-a01", debit_inst="gtbank",
            credit_acct="kuda-a02", credit_inst="kuda",
            amount=amt, fee=fee, ts=mb.replace(day=2, hour=9, minute=15),
            settle_minutes=3, ref=ref, user_label=NAME, user_alias=ALIAS,
        )
        # Genuine spending across both accounts
        b.add("gtb-a01", "gtbank", 250000, "debit", mb.replace(day=3, hour=10),
              "TRF TO BABATUNDE PROPERTIES RENT", counterparty_name="BABATUNDE PROPERTIES",
              raw_category="rent")
        b.add("gtb-a01", "gtbank", 18500, "debit", mb.replace(day=5, hour=19, minute=30),
              "POS PURCHASE SHOPRITE SURULERE LAGOS", raw_category="pos")
        b.add("kuda-a02", "kuda", 2000, "debit", mb.replace(day=6, hour=7, minute=45),
              "AIRTIME PURCHASE MTN 08031230000", raw_category="airtime")
        b.add("kuda-a02", "kuda", 3500, "debit", mb.replace(day=8, hour=8),
              "DATA BUNDLE MTN 08031230000", raw_category="data")
        b.add("gtb-a01", "gtbank", 15700, "debit", mb.replace(day=10, hour=12),
              "IKEDC PREPAID ELECTRICITY TOKEN", counterparty_name="IKEDC",
              raw_category="utilities")
        b.add("kuda-a02", "kuda", 6500, "debit", mb.replace(day=12, hour=21),
              "NETFLIX SUBSCRIPTION NG", counterparty_name="NETFLIX", raw_category="subscription")
        b.add("gtb-a01", "gtbank", 42300, "debit", mb.replace(day=15, hour=13, minute=20),
              "POS PURCHASE JUMIA FOOD LEKKI", raw_category="pos")
        b.add("kuda-a02", "kuda", 8750, "debit", mb.replace(day=18, hour=16),
              "POS PURCHASE MEDPLUS PHARMACY", raw_category="pos")
        b.add("gtb-a01", "gtbank", 27800, "debit", mb.replace(day=22, hour=11),
              "TRF TO CHINWE TAILOR ANKARA", counterparty_name="CHINWE", raw_category="transfer")
        b.add("kuda-a02", "kuda", 12400, "debit", mb.replace(day=25, hour=20, minute=10),
              "POS PURCHASE BOLT RIDE LAGOS", raw_category="pos")
        # extra everyday spending (genuine, unlabelled) — distinct amounts
        b.add("kuda-a02", "kuda", 5400, "debit", mb.replace(day=7, hour=13),
              "POS PURCHASE CHICKEN REPUBLIC IKEJA", raw_category="pos")
        b.add("gtb-a01", "gtbank", 9900, "debit", mb.replace(day=11, hour=20),
              "POS PURCHASE FILMHOUSE CINEMA", raw_category="pos")
        b.add("gtb-a01", "gtbank", 16750, "debit", mb.replace(day=14, hour=7, minute=30),
              "TRF TO i-FITNESS GYM MONTHLY", counterparty_name="I-FITNESS",
              raw_category="transfer")
        b.add("kuda-a02", "kuda", 33200, "debit", mb.replace(day=19, hour=15),
              "POS PURCHASE GAME STORES LEKKI", raw_category="pos")
        b.add("kuda-a02", "kuda", 4800, "debit", mb.replace(day=28, hour=21, minute=15),
              "POS PURCHASE UBER EATS", raw_category="pos")
        # a small genuine inbound refund (income, unlabelled) — distinct amount
        if m in (1, 3):
            b.add("gtb-a01", "gtbank", 7350, "credit", mb.replace(day=20, hour=10),
                  "REFUND JUMIA ORDER 90455", raw_category="refund")

    # Hard negative: a genuine third-party debit close in amount/timing to month-5 sweep
    # (90000). The sweep leg owns the mirror credit (shared ref); this must stay unmatched.
    hb = _month(base, 4).replace(day=2, hour=9, minute=5)
    b.add("gtb-a01", "gtbank", 89500, "debit", hb,
          "TRF TO DANGOTE REFINERY FUEL ORDER", counterparty_name="DANGOTE REFINERY",
          raw_category="transfer")
    return b


# ---------------------------------------------------------------------------------------
# Persona B — gig / SME owner (GTBank + Access + OPay + a USD domiciliary account).
# Irregular client payments, lots of float-shuffling self-transfers, a cross-currency
# self-transfer (expected miss), a cross-currency remittance in, and monthly black-tax.
# ---------------------------------------------------------------------------------------

def build_persona_b() -> Builder:
    user = {
        "user_id": "u_persona_b",
        "full_name": "Emeka Balogun",
        "aliases": ["Emeka O Balogun", "Balogun Emeka", "E O Balogun"],
        "account_ids": ["gtb-b01", "access-b02", "opay-b03", "domv-b04"],
    }
    b = Builder(user)
    base = datetime(2026, 4, 1, 0, 0)
    NAME, ALIAS = "EMEKA BALOGUN", "EMEKA O BALOGUN"

    # Irregular client payments (genuine income) — signature amounts, spread across banks.
    client_payments = [
        ("gtb-b01", "gtbank", 237500, 1, 4, 11, "TRF FROM PAYSTACK SETTLEMENT INV2231"),
        ("access-b02", "access", 418900, 1, 9, 14, "NIP CR FROM FLUTTERWAVE MERCHANT PAYOUT"),
        ("opay-b03", "opay", 95300, 1, 16, 10, "Payment received ACME STUDIOS LTD"),
        ("gtb-b01", "gtbank", 168750, 1, 23, 15, "TRF FROM JANE ADEYEMI DESIGN INVOICE 7781"),
        ("access-b02", "access", 512400, 2, 6, 12, "NIP CR FROM PAYSTACK SETTLEMENT INV2290"),
        ("opay-b03", "opay", 73200, 2, 14, 9, "Payment received ZENITH FOODS NG"),
        ("gtb-b01", "gtbank", 289600, 2, 21, 16, "TRF FROM FLUTTERWAVE MERCHANT PAYOUT"),
        ("access-b02", "access", 143850, 3, 5, 10, "NIP CR FROM ACME STUDIOS LTD RETAINER"),
        ("opay-b03", "opay", 61250, 3, 12, 13, "Payment received JANE ADEYEMI DESIGN"),
        ("gtb-b01", "gtbank", 376400, 3, 19, 11, "TRF FROM PAYSTACK SETTLEMENT INV2355"),
        ("access-b02", "access", 204700, 4, 7, 14, "NIP CR FROM FLUTTERWAVE PAYOUT APR"),
        ("gtb-b01", "gtbank", 455900, 4, 18, 10, "TRF FROM PAYSTACK SETTLEMENT INV2410"),
    ]
    for acct, inst, amt, mo, day, hour, nar in client_payments:
        b.add(acct, inst, amt, "credit", _month(base, mo).replace(day=day, hour=hour),
              nar, raw_category="business_income")

    # Float-shuffling self-transfers between his NGN banks (all share a NIP reference).
    sweeps = [
        ("B-F1", "gtb-b01", "gtbank", "opay-b03", "opay", 200000, 0, 0, 5, 12, 2, "660112223301"),
        ("B-F2", "access-b02", "access", "gtb-b01", "gtbank", 150000, 20, 0, 11, 15, 4, "660112223415"),
        ("B-F3", "opay-b03", "opay", "access-b02", "access", 80000, 15, 1, 8, 10, 3, "660112223588"),
        ("B-F4", "gtb-b01", "gtbank", "access-b02", "access", 300000, 0, 1, 22, 9, 2, None),  # name-only
        ("B-F5", "access-b02", "access", "opay-b03", "opay", 120000, 25, 2, 10, 13, 6, "660112223744"),
        ("B-F6", "gtb-b01", "gtbank", "opay-b03", "opay", 250000, 50, 3, 20, 16, 3, "660112223901"),
        ("B-F7", "opay-b03", "opay", "gtb-b01", "gtbank", 60000, 10, 4, 9, 11, 2, "660112224066"),
    ]
    for pid, da, di, ca, ci, amt, fee, mo, day, hr, mins, ref in sweeps:
        b.self_transfer(
            pid, debit_acct=da, debit_inst=di, credit_acct=ca, credit_inst=ci,
            amount=amt, fee=fee, ts=_month(base, mo).replace(day=day, hour=hr),
            settle_minutes=mins, ref=ref, user_label=NAME, user_alias=ALIAS,
        )

    # Cross-currency self-transfer: USD domiciliary debit -> NGN credit into GTBank.
    # Labelled, but amount-based dedup CANNOT match 150 USD against 231750 NGN — expected miss.
    fx_ts = _month(base, 2).replace(day=17, hour=12)
    b.add("domv-b04", "domv", 150, "debit", fx_ts,
          "FX OUTWARD TRF TO SELF NGN/REF:FX778812", currency="USD",
          counterparty_name=NAME, reference="FX778812",
          raw_category="transfer", transfer_pair_id="B-FX", id_prefix="st")
    b.add("gtb-b01", "gtbank", 231750, "credit", fx_ts + timedelta(minutes=40),
          "INWARD FX CONVERSION FROM DOM ACCT EMEKA BALOGUN/REF:FX778812",
          counterparty_name=ALIAS, reference="FX778812",
          raw_category="transfer", transfer_pair_id="B-FX", id_prefix="st")

    # Cross-currency remittance received from abroad (into USD domiciliary) — communal.
    for mo, day, amt in [(0, 12, 500), (2, 9, 650), (4, 11, 500)]:
        b.add("domv-b04", "domv", amt, "credit",
              _month(base, mo).replace(day=day, hour=15),
              "INWARD REMITTANCE WORLDREMIT FROM UK SENDER CHIOMA BALOGUN", currency="USD",
              counterparty_name="CHIOMA BALOGUN", raw_category="remittance",
              communal_tag="remittance_in")

    # Monthly black-tax / dependent support to his mother (recurring, out).
    for mo in range(5):
        b.add("gtb-b01", "gtbank", 50000, "debit",
              _month(base, mo).replace(day=28, hour=18),
              "TRF TO MAMA EMEKA UPKEEP ONITSHA", counterparty_name="MAMA EMEKA",
              raw_category="transfer", communal_tag="dependent")

    # Genuine SME spending (unlabelled), distinct amounts.
    spend = [
        ("gtb-b01", "gtbank", 320000, 0, 7, "TRF TO LANDLORD OFFICE RENT IKEJA", "rent"),
        ("opay-b03", "opay", 18900, 0, 14, "POS PURCHASE SLOT SYSTEMS COMPUTER", "pos"),
        ("access-b02", "access", 44500, 1, 10, "POS PURCHASE DOMINOS PIZZA VI", "pos"),
        ("gtb-b01", "gtbank", 9800, 1, 17, "AIRTIME PURCHASE AIRTEL 08099887766", "airtime"),
        ("opay-b03", "opay", 67400, 1, 26, "TRF TO SUPPLIER FABRICS ADO MARKET", "transfer"),
        ("access-b02", "access", 23600, 2, 13, "POS PURCHASE SPAR MARKET LEKKI", "pos"),
        ("gtb-b01", "gtbank", 135000, 2, 24, "TRF TO FREELANCER DEV CONTRACT", "transfer"),
        ("opay-b03", "opay", 5200, 3, 6, "DATA BUNDLE GLO 08055443322", "data"),
        ("access-b02", "access", 78300, 3, 16, "POS PURCHASE FILLING STATION TOTAL", "pos"),
        ("gtb-b01", "gtbank", 29900, 4, 15, "POS PURCHASE EBEANO SUPERMARKET", "pos"),
    ]
    for acct, inst, amt, mo, day, nar, cat in spend:
        b.add(acct, inst, amt, "debit", _month(base, mo).replace(day=day, hour=13),
              nar, raw_category=cat)

    # Recurring everyday SME spending (genuine, unlabelled) across the 5 months.
    for mo in range(5):
        mb = _month(base, mo)
        b.add("opay-b03", "opay", 6700, "debit", mb.replace(day=4, hour=9),
              "POS PURCHASE COLD STONE CREAMERY", raw_category="pos")
        b.add("gtb-b01", "gtbank", 15400, "debit", mb.replace(day=8, hour=11),
              "POS PURCHASE SHOPRITE IKEJA CITY MALL", raw_category="pos")
        b.add("access-b02", "access", 11200, "debit", mb.replace(day=11, hour=16),
              "POS PURCHASE JUMIA ELECTRONICS", raw_category="pos")
        b.add("gtb-b01", "gtbank", 5000, "debit", mb.replace(day=19, hour=8),
              "AIRTIME PURCHASE MTN 08099887766", raw_category="airtime")
        b.add("opay-b03", "opay", 28900, "debit", mb.replace(day=25, hour=12),
              "POS PURCHASE NNPC FILLING STATION", raw_category="pos")
        b.add("access-b02", "access", 8300, "debit", mb.replace(day=6, hour=10),
              "POS PURCHASE BOOKSELLERS LTD", raw_category="pos")
        b.add("gtb-b01", "gtbank", 19700, "debit", mb.replace(day=9, hour=18),
              "POS PURCHASE THE PALMS MALL", raw_category="pos")
        b.add("opay-b03", "opay", 7100, "debit", mb.replace(day=15, hour=7, minute=40),
              "DATA BUNDLE MTN 08099887766", raw_category="data")
        b.add("access-b02", "access", 13900, "debit", mb.replace(day=23, hour=14),
              "POS PURCHASE PARK N SHOP", raw_category="pos")

    # Hard negative: a genuine supplier payment close in amount & time to sweep B-F6
    # (gtb 250000 -> opay). The real sweep (shared ref, 0.98) must claim the opay credit;
    # this third-party debit must be left unmatched by the global assignment.
    b.add("access-b02", "access", 249000, "debit",
          _month(base, 3).replace(day=20, hour=15, minute=50),
          "TRF TO JULIUS BERGER CONSTRUCTION DEPOSIT",
          counterparty_name="JULIUS BERGER", raw_category="transfer")
    return b


# ---------------------------------------------------------------------------------------
# Persona C — mixed, communal-heavy (GTBank + OPay + PalmPay). Emphasizes ajo/esusu,
# black-tax, and informal lending, with a couple of self-transfers for good measure.
# ---------------------------------------------------------------------------------------

def build_persona_c() -> Builder:
    user = {
        "user_id": "u_persona_c",
        "full_name": "Funmilayo Adeyemi",
        "aliases": ["Funmilayo B Adeyemi", "Adeyemi Funmilayo"],
        "account_ids": ["gtb-c01", "opay-c02", "palmpay-c03"],
    }
    b = Builder(user)
    base = datetime(2026, 6, 1, 0, 0)
    NAME, ALIAS = "FUNMILAYO ADEYEMI", "FUNMILAYO B ADEYEMI"

    for m in range(4):
        mb = _month(base, m)
        # Genuine income — small-business inflows, signature amounts.
        b.add("gtb-c01", "gtbank", 185000 + m * 1500, "credit", mb.replace(day=2, hour=10),
              "TRF FROM BALOGUN MARKET STALL SALES", raw_category="business_income")
        b.add("opay-c02", "opay", 42600 + m * 300, "credit", mb.replace(day=17, hour=14),
              "Payment received CATERING GIG DEPOSIT", raw_category="business_income")

        # Monthly ajo/esusu contribution OUT to the collector (same amount every month).
        b.add("gtb-c01", "gtbank", 20000, "debit", mb.replace(day=5, hour=9),
              "TRF TO IYABO ADISA AJO CONTRIBUTION", counterparty_name="IYABO ADISA",
              raw_category="transfer", communal_tag="ajo")

        # Monthly black-tax to a named relative (recurring, out).
        b.add("opay-c02", "opay", 30000, "debit", mb.replace(day=27, hour=18, minute=30),
              "TRF TO BROTHER TUNDE SCHOOL FEES SUPPORT", counterparty_name="TUNDE ADEYEMI",
              raw_category="transfer", communal_tag="dependent")

        # Genuine spending (unlabelled), distinct amounts.
        b.add("opay-c02", "opay", 1500, "debit", mb.replace(day=6, hour=8),
              "AIRTIME PURCHASE GLO 08022110099", raw_category="airtime")
        b.add("gtb-c01", "gtbank", 13250, "debit", mb.replace(day=9, hour=12),
              "POS PURCHASE MARKET SQUARE YABA", raw_category="pos")
        b.add("palmpay-c03", "palmpay", 7900, "debit", mb.replace(day=13, hour=17),
              "POS PURCHASE SHOPRITE ILUPEJU", raw_category="pos")
        b.add("gtb-c01", "gtbank", 21400, "debit", mb.replace(day=21, hour=19),
              "IBEDC PREPAID ELECTRICITY IBADAN", counterparty_name="IBEDC",
              raw_category="utilities")
        b.add("palmpay-c03", "palmpay", 3300, "debit", mb.replace(day=24, hour=20),
              "DATA BUNDLE AIRTEL 08133220011", raw_category="data")
        # more everyday spending (genuine, unlabelled), distinct amounts
        b.add("opay-c02", "opay", 2600, "debit", mb.replace(day=7, hour=8, minute=30),
              "POS PURCHASE MAMA PUT BUKA", raw_category="pos")
        b.add("palmpay-c03", "palmpay", 8900, "debit", mb.replace(day=11, hour=13),
              "POS PURCHASE JUST RICE RESTAURANT", raw_category="pos")
        b.add("opay-c02", "opay", 4200, "debit", mb.replace(day=16, hour=9),
              "AIRTIME PURCHASE GLO 08022110099", raw_category="airtime")
        b.add("gtb-c01", "gtbank", 14700, "debit", mb.replace(day=20, hour=15),
              "POS PURCHASE SPAR MARKET SURULERE", raw_category="pos")
        b.add("palmpay-c03", "palmpay", 19800, "debit", mb.replace(day=23, hour=17, minute=30),
              "TRF TO BEAUTY HAUS HAIR SALON", counterparty_name="BEAUTY HAUS",
              raw_category="transfer")
        b.add("gtb-c01", "gtbank", 6400, "debit", mb.replace(day=26, hour=19),
              "POS PURCHASE GRILLED BUKA YABA", raw_category="pos")
        b.add("opay-c02", "opay", 5100, "debit", mb.replace(day=3, hour=12),
              "POS PURCHASE ADDIDE SUPERMARKET", raw_category="pos")
        b.add("palmpay-c03", "palmpay", 9400, "debit", mb.replace(day=10, hour=18),
              "POS PURCHASE KFC ADENIRAN", raw_category="pos")
        b.add("gtb-c01", "gtbank", 11600, "debit", mb.replace(day=14, hour=16),
              "POS PURCHASE PRINCE EBEANO", raw_category="pos")
        b.add("opay-c02", "opay", 2900, "debit", mb.replace(day=28, hour=9),
              "DATA BUNDLE MTN 08022110099", raw_category="data")

    # Ajo PAYOUT received when it is Funmilayo's turn (lump sum, in).
    b.add("gtb-c01", "gtbank", 80000, "credit", _month(base, 2).replace(day=6, hour=11),
          "TRF FROM IYABO ADISA AJO PAYOUT TURN", counterparty_name="IYABO ADISA",
          raw_category="transfer", communal_tag="ajo_payout")

    # Informal loan OUT to a friend, then a PARTIAL repayment received weeks later.
    b.add("opay-c02", "opay", 50000, "debit", _month(base, 0).replace(day=14, hour=16),
          "TRF TO CHIDI FRIEND SOFT LOAN", counterparty_name="CHIDI OKEKE",
          raw_category="transfer", communal_tag="informal_loan_out")
    b.add("opay-c02", "opay", 20000, "credit", _month(base, 1).replace(day=19, hour=15),
          "TRF FROM CHIDI OKEKE LOAN PART REPAYMENT", counterparty_name="CHIDI OKEKE",
          raw_category="transfer", communal_tag="loan_repayment")

    # A couple of self-transfers between her own banks (shared NIP reference).
    b.self_transfer(
        "C-SW1", debit_acct="gtb-c01", debit_inst="gtbank",
        credit_acct="opay-c02", credit_inst="opay",
        amount=45000, fee=0, ts=_month(base, 1).replace(day=3, hour=10),
        settle_minutes=4, ref="770998811234", user_label=NAME, user_alias=ALIAS,
    )
    b.self_transfer(
        "C-SW2", debit_acct="opay-c02", debit_inst="opay",
        credit_acct="palmpay-c03", credit_inst="palmpay",
        amount=35000, fee=20, ts=_month(base, 3).replace(day=15, hour=9),
        settle_minutes=5, ref="770998811560", user_label=NAME, user_alias=ALIAS,
    )
    return b


def main() -> None:
    targets = {
        "persona_a.json": build_persona_a(),
        "persona_b.json": build_persona_b(),
        "persona_c.json": build_persona_c(),
    }
    MOCK_DIR.mkdir(parents=True, exist_ok=True)
    for name, builder in targets.items():
        path = MOCK_DIR / name
        builder.dump(path)
        print(f"wrote {path}  ({len(builder.txns)} transactions)")


if __name__ == "__main__":
    main()

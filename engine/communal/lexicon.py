"""Lexicons and narration cues for communal-finance classification.

The classifier is *keyword-anchored*: a transaction is only ever tagged communal when
a purpose cue is present (optionally reinforced by relationship structure). This is what
keeps recurring *business* transfers — rent to a "PROPERTIES" company, a monthly gym or
salon debit, a Paystack settlement — from being mistaken for a dependent/ajo flow just
because they recur. Those carry no communal cue, so they stay untagged.

Cues are matched against the uppercased narration (plus any bank-supplied counterparty
name). They are intentionally general Nigerian financial vocabulary — ajo/esusu/adashe,
upkeep/school fees, soft loan, inward remittance — not fixture-specific strings.
"""

from __future__ import annotations

import re
from typing import Dict, List

from ..schemas.communal import CommunalTag

# --- hard exclusions: merchant spending, bills, business income ---------------------
# If any of these appears, the transaction is not a communal relationship flow at all.
_MERCHANT_BILL_CUES: List[str] = [
    r"\bPOS\b", r"\bPURCHASE\b", r"\bAIRTIME\b", r"\bDATA BUNDLE\b", r"\bELECTRICITY\b",
    r"\bPREPAID\b", r"\bSUBSCRIPTION\b", r"\bSETTLEMENT\b", r"\bREFUND\b", r"\bSALARY\b",
    r"\bFILLING STATION\b", r"\bFUEL\b", r"\bWITHDRAWAL\b", r"\bATM\b",
    # payment-processor / gateway settlements = business income, never communal
    r"\bMERCHANT\b", r"\bFLUTTERWAVE\b", r"\bPAYSTACK\b", r"\bMONIEPOINT\b",
    r"\bINTERSWITCH\b", r"\bREMITA\b", r"\bGATEWAY\b",
    # business / service counterparties (recurring but not communal)
    r"\bPROPERTIES\b", r"\bRENT\b", r"\bSALON\b", r"\bSALES\b", r"\bSTALL\b",
    r"\bSUPERMARKET\b", r"\bRESTAURANT\b", r"\bPHARMACY\b", r"\bCINEMA\b", r"\bGYM\b",
    r"\bFITNESS\b", r"\bHOTEL\b", r"\bLOUNGE\b", r"\bVENTURES\b", r"\bENTERPRISE[S]?\b",
    r"\bVENDOR\b", r"\bVENDORS\b", r"\bINVOICE\b",
]

# --- per-class purpose cues ---------------------------------------------------------
# Direction gating (debit vs credit) is applied by the classifier, not here.
_CLASS_CUES: Dict[CommunalTag, List[str]] = {
    "ajo": [
        r"\bAJO\b", r"\bESUSU\b", r"\bADASHE\b", r"\bASUSU\b", r"\bTHRIFT\b",
        r"\bCONTRIBUTION\b", r"\bCOOPERATIVE\b", r"\bCOOP\b", r"\bSAVINGS CLUB\b",
    ],
    "ajo_payout": [
        r"\bPAYOUT\b", r"\bDISBURSEMENT\b", r"\bPAY[- ]?OUT\b", r"\bMY TURN\b",
    ],
    "dependent": [
        r"\bUPKEEP\b", r"\bALLOWANCE\b", r"\bSTIPEND\b", r"\bSUPPORT\b", r"\bFEEDING\b",
        r"\bSCHOOL FEES\b", r"\bPOCKET MONEY\b", r"\bPROVISION[S]?\b",
        # family relations
        r"\bMAMA\b", r"\bPAPA\b", r"\bMUM\b", r"\bMUMMY\b", r"\bMOTHER\b", r"\bDAD\b",
        r"\bDADDY\b", r"\bFATHER\b", r"\bBROTHER\b", r"\bSISTER\b", r"\bUNCLE\b",
        r"\bAUNTY\b", r"\bAUNT\b", r"\bGRANDMA\b", r"\bGRANDPA\b", r"\bNIECE\b",
        r"\bNEPHEW\b", r"\bCOUSIN\b", r"\bSON\b", r"\bDAUGHTER\b",
    ],
    "informal_loan_out": [
        r"\bSOFT LOAN\b", r"\bLOAN\b", r"\bBORROW\b", r"\bLEND\b", r"\bLENT\b", r"\bIOU\b",
    ],
    "loan_repayment": [
        r"\bREPAYMENT\b", r"\bREPAY\b", r"\bPAY ?BACK\b", r"\bPAID BACK\b",
        r"\bREFUND OF LOAN\b", r"\bLOAN RETURN\b",
    ],
    "remittance_in": [
        r"\bREMITTANCE\b", r"\bWORLDREMIT\b", r"\bSENDWAVE\b", r"\bMONEYGRAM\b",
        r"\bWESTERN UNION\b", r"\bRIA\b", r"\bWISE\b", r"\bINWARD\b", r"\bDIASPORA\b",
        r"\bFROM UK\b", r"\bFROM USA\b", r"\bFROM CANADA\b", r"\bABROAD\b",
    ],
}

_COMPILED: Dict[CommunalTag, List[re.Pattern]] = {
    tag: [re.compile(p) for p in pats] for tag, pats in _CLASS_CUES.items()
}
_COMPILED_MERCHANT = [re.compile(p) for p in _MERCHANT_BILL_CUES]


def _text(narration: str, counterparty_name: str | None) -> str:
    return f"{narration or ''} {counterparty_name or ''}".upper()


def is_merchant_or_bill(narration: str, counterparty_name: str | None = None) -> bool:
    text = _text(narration, counterparty_name)
    return any(p.search(text) for p in _COMPILED_MERCHANT)


def cue_hits(tag: CommunalTag, narration: str, counterparty_name: str | None = None) -> List[str]:
    """The distinct cue words of `tag` present in the text (for scoring + explanations)."""
    text = _text(narration, counterparty_name)
    hits: List[str] = []
    for p in _COMPILED[tag]:
        m = p.search(text)
        if m:
            hits.append(m.group(0).strip())
    return hits

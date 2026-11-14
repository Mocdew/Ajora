"""Member-scoped statements from the savings ledger."""
import csv
from io import StringIO
from pathlib import Path
from typing import Literal
import unicodedata

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, PlainTextResponse, Response

from .savings import Circle, current_user, database, get_savings_path, load_circle


router = APIRouter(prefix="/savings", tags=["savings"])
MODE_LABEL = {
    "manual": "External payments reviewed manually",
    "demo": "Demo circle · simulated payments and records",
    "legacy": "Legacy circle · original payment mode unspecified",
}


def money(kobo: int) -> str:
    naira, fraction = divmod(kobo, 100)
    return f"NGN {naira:,}.{fraction:02d}"


def inline(value: str) -> str:
    """Keep member-entered text from creating or reordering statement rows."""
    return "".join(
        ascii(character)[1:-1] if unicodedata.category(character) in {"Cc", "Cf", "Zl", "Zp"} else character
        for character in value
    )


def fields(value, path: str = ""):
    """Flatten the JSON statement without including any untrusted column names."""
    if isinstance(value, dict):
        for field, item in value.items():
            yield from fields(item, f"{path}.{field}" if path else field)
    elif isinstance(value, list):
        for index, item in enumerate(value, start=1):
            yield from fields(item, f"{path}[{index}]")
    else:
        yield path, value


def spreadsheet_cell(value):
    if isinstance(value, str) and (
        value.startswith(("\t", "\r", "\n")) or value.lstrip().startswith(("=", "+", "-", "@", "＝", "＋", "－", "＠"))
    ):
        return "'" + value
    return value


def statement(circle: Circle) -> str:
    names = {member.user_id: inline(member.display_name) for member in circle.members}
    mode = MODE_LABEL[circle.mode]
    lines = [
        f"Ajora savings statement | {inline(circle.name)}",
        mode,
        f"Circle ID {circle.id} | {circle.status} | created {circle.created_at}",
        f"Agreement v{circle.agreement_version} | {circle.frequency} | starts {circle.start_date}",
        f"Contribution per member per round {money(circle.contribution_kobo)}",
        "",
        "Current terms",
        *(("  " + inline(line) for line in circle.rules.split("\n")) if circle.rules
          else ("No additional rules recorded.",)),
        "",
        "Payout order",
        *(f"{member.position}. {names[member.user_id]} ({member.user_id})"
          for member in sorted(circle.members, key=lambda member: member.position)),
        "",
        "Current acceptances",
        *(f"{names.get(item.member_id, item.member_id)} | v{item.version} | {item.accepted_at}"
          for item in circle.acceptances),
    ]
    for number, due_date in enumerate(circle.due_dates, start=1):
        claims = [claim for claim in circle.contributions if claim.round_number == number]
        confirmed = sum(claim.confirmed_kobo for claim in claims)
        lines.extend(("", f"Round {number} | due {due_date} | confirmed {money(confirmed)}"))
        for claim in claims:
            lines.append(f"  {names.get(claim.member_id, claim.member_id)} | {claim.status} | confirmed {money(claim.confirmed_kobo)}")
            for payment in claim.payments:
                evidence = "simulated receipt" if payment.source == "demo" else "manual claim"
                lines.append(
                    f"    {payment.id} | {money(payment.amount_kobo)} | {payment.status} | {evidence} | "
                    f"reference {inline(payment.reference)} | submitted {payment.submitted_at}"
                )
                if payment.receipt_id:
                    lines.append(f"      Receipt identifier {payment.receipt_id}")
                if payment.confirmed_at:
                    lines.append(f"      Confirmed {payment.confirmed_at}")
                if payment.rejection_reason:
                    lines.append(f"      Decision reason {inline(payment.rejection_reason)}")
            for rejected in claim.history:
                lines.append(
                    f"    Earlier claim {inline(rejected.reference)} | submitted {rejected.submitted_at} | "
                    f"rejected {rejected.rejected_at} | {inline(rejected.rejection_reason)}"
                )
        for payout in circle.payouts:
            if payout.round_number == number:
                lines.append(
                    f"  Payout to {names.get(payout.member_id, payout.member_id)} | {money(payout.amount_kobo)} | "
                    f"{payout.status} | reference {inline(payout.reference)} | reported {payout.recorded_at}"
                )
                if payout.received_at:
                    lines.append(f"    Recipient confirmed {payout.received_at}")
                if payout.dispute_reason:
                    lines.append(f"    Receipt issue {inline(payout.dispute_reason)}")
        for case in circle.payment_disputes:
            if case.round_number == number:
                lines.append(
                    f"  Case {case.id} | payment {case.payment_id} | opened {case.opened_at} by "
                    f"{names.get(case.opened_by, case.opened_by)} | {inline(case.reason)}"
                )
                lines.append(f"    Resolved {case.resolved_at} | {inline(case.resolution or '')}" if case.resolved_at else "    Open")
    lines.extend(("", "History"))
    for event in circle.events:
        lines.append(f"{event.at} | {names.get(event.actor_id, event.actor_id)} | {event.kind} | {inline(event.detail)}")
        if event.agreement:
            agreement = event.agreement
            lines.append(
                f"  Agreement v{agreement['agreement_version']} | {money(agreement['contribution_kobo'])} | "
                f"{agreement['frequency']} | starts {agreement['start_date']}"
            )
            lines.append(f"  Terms {inline(agreement['rules']) or 'No additional rules recorded.'}")
            order = sorted(agreement["members"], key=lambda member: member["position"])
            lines.append("  Payout order " + ", ".join(inline(member["display_name"]) for member in order))
            if agreement.get("collection_account"):
                lines.append(f"  Simulated collection account {inline(agreement['collection_account']['label'])}")
    return "\n".join(lines) + "\n"


@router.get("/circles/{circle_id}/export", response_class=JSONResponse)
def export_circle(
    circle_id: str,
    format: Literal["json", "text", "csv"] = "json",
    user: dict = Depends(current_user),
    path: Path = Depends(get_savings_path),
):
    with database(path) as conn:
        circle = Circle.model_validate(load_circle(conn, circle_id, user))
    headers = {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    }
    if format == "text":
        headers["Content-Disposition"] = 'attachment; filename="ajora-savings.txt"'
        return PlainTextResponse(statement(circle), headers=headers)
    payload = {
        "format_version": 1,
        "currency": "NGN",
        "mode_description": MODE_LABEL[circle.mode],
        "circle": circle.model_dump(mode="json", exclude={"invite_code"}),
    }
    if format == "csv":
        output = StringIO(newline="")
        writer = csv.writer(output, quoting=csv.QUOTE_ALL)
        writer.writerow(("Field", "Value"))
        writer.writerows((spreadsheet_cell(path), spreadsheet_cell(value)) for path, value in fields(payload))
        headers["Content-Disposition"] = 'attachment; filename="ajora-savings.csv"'
        return Response(output.getvalue(), media_type="text/csv", headers=headers)
    headers["Content-Disposition"] = 'attachment; filename="ajora-savings.json"'
    return JSONResponse(payload, headers=headers)

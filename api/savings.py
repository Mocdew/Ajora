"""Persistent ajo tracker. External payments are recorded, never executed here.

A browser session owns a generated identity; private recovery keys restore access.
Raw bank feed data stays ephemeral. SQLite holds circle agreements, contribution
claims, minimal reconciliation evidence and payout acknowledgements.
"""
from __future__ import annotations

import calendar
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import time
from typing import Literal, Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .savings_feed import BankFeed, MatchCandidate, get_bank_feed_provider

router = APIRouter(prefix="/savings", tags=["savings"])
COOKIE = "ajora_savings_session"
SESSION_SECONDS = 60 * 60 * 24 * 30


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SessionInput(Input):
    display_name: str = Field(min_length=2, max_length=80)


class CreateCircle(Input):
    name: str = Field(min_length=2, max_length=120)
    contribution_kobo: int = Field(strict=True, gt=0, le=100_000_000_000)
    frequency: Literal["weekly", "monthly"]
    member_limit: int = Field(strict=True, ge=2, le=50)
    start_date: date
    rules: str = Field(default="", max_length=4000)

    @field_validator("start_date")
    @classmethod
    def future_date(cls, value: date) -> date:
        today = datetime.now(timezone(timedelta(hours=1))).date()
        if value < today or value > today + timedelta(days=366 * 5):
            raise ValueError("Start date must be today or within the next five years (Africa/Lagos).")
        return value


class JoinCircle(Input):
    invite_code: str = Field(min_length=6, max_length=64)


class OrderInput(Input):
    member_ids: list[str] = Field(min_length=1, max_length=50)


class ContributionInput(Input):
    round_number: int = Field(strict=True, ge=1)
    reference: str = Field(min_length=3, max_length=200)
    amount_kobo: Optional[int] = Field(default=None, strict=True, gt=0, le=100_000_000_000)


class PayoutInput(Input):
    round_number: int = Field(strict=True, ge=1)
    reference: str = Field(min_length=3, max_length=200)


class CollectionAccount(Input):
    account_id: Literal["demo-collection"]
    label: str = Field(min_length=2, max_length=120)
    source: Literal["demo"] = "demo"


class AgreementInput(Input):
    version: int = Field(strict=True, ge=1)


class MatchInput(Input):
    transaction_id: str = Field(min_length=1, max_length=200)


class Acceptance(BaseModel):
    member_id: str
    version: int
    accepted_at: str


class CircleEvent(BaseModel):
    id: str
    kind: str
    actor_id: str
    at: str
    detail: str
    agreement: Optional[dict] = None


class Payment(BaseModel):
    id: str
    amount_kobo: int
    reference: str
    status: Literal["submitted", "confirmed", "rejected"]
    source: Literal["manual", "demo"] = "manual"
    receipt_id: Optional[str] = None
    submitted_at: str
    confirmed_at: Optional[str] = None
    rejection_reason: Optional[str] = None


class RejectInput(Input):
    reason: str = Field(min_length=3, max_length=500)


class EmptyInput(Input):
    pass


class Session(BaseModel):
    user_id: str
    display_name: str
    email: Optional[str] = None


class Member(BaseModel):
    user_id: str
    display_name: str
    position: int


class RejectedClaim(BaseModel):
    reference: str
    submitted_at: str
    rejected_at: str
    rejection_reason: str


class Contribution(BaseModel):
    member_id: str
    round_number: int
    status: Literal["submitted", "confirmed", "rejected"]
    reference: str
    submitted_at: str
    confirmed_at: Optional[str]
    rejection_reason: Optional[str] = None
    rejected_at: Optional[str] = None
    history: list[RejectedClaim] = Field(default_factory=list)
    payments: list[Payment] = Field(default_factory=list)
    confirmed_kobo: int = 0
    matched_kobo: int = 0


class Payout(BaseModel):
    round_number: int
    member_id: str
    amount_kobo: int
    reference: str
    recorded_at: str
    status: Literal["sent", "received", "disputed", "legacy_recorded"] = "legacy_recorded"
    received_at: Optional[str] = None
    dispute_reason: Optional[str] = None


class Circle(BaseModel):
    id: str
    name: str
    organizer_id: str
    contribution_kobo: int
    frequency: Literal["weekly", "monthly"]
    member_limit: int
    start_date: str
    rules: str
    invite_code: str
    status: Literal["draft", "active", "completed"]
    current_round: int
    members: list[Member]
    contributions: list[Contribution]
    payouts: list[Payout]
    due_dates: list[str]
    created_at: str
    collection_account: Optional[CollectionAccount] = None
    agreement_version: int = 1
    acceptances: list[Acceptance] = Field(default_factory=list)
    events: list[CircleEvent] = Field(default_factory=list)


class InvitationPreview(BaseModel):
    name: str
    contribution_kobo: int
    frequency: Literal["weekly", "monthly"]
    member_limit: int
    start_date: str
    rules: str
    status: Literal["draft", "active", "completed"]
    member_count: int


def get_savings_path() -> Path:
    return Path(os.environ.get("AJORA_STATE_DIR", str(Path(__file__).resolve().parent.parent))) / "savings.sqlite3"


@contextmanager
def database(path: Path, *, write: bool = False):
    from .savings_storage import connect_savings
    conn = connect_savings(path)
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS savings_users (
                id TEXT PRIMARY KEY, display_name TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS savings_sessions (
                token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS savings_credentials (
                user_id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS savings_recovery_keys (
                user_id TEXT PRIMARY KEY, key_hash TEXT UNIQUE NOT NULL
            );
            CREATE TABLE IF NOT EXISTS auth_attempts (
                scope TEXT PRIMARY KEY, attempts INTEGER NOT NULL, started_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS savings_receipts (
                source TEXT NOT NULL, account_id TEXT NOT NULL, receipt_id TEXT NOT NULL,
                circle_id TEXT NOT NULL, payment_id TEXT NOT NULL,
                PRIMARY KEY(source, account_id, receipt_id)
            );
            CREATE TABLE IF NOT EXISTS savings_circles (
                id TEXT PRIMARY KEY, invite_code TEXT UNIQUE NOT NULL, document TEXT NOT NULL
            );
        """)
        if write:
            conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def session_user(request: Request, path: Path):
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    with database(path) as conn:
        row = conn.execute(
            "SELECT u.id AS user_id, u.display_name, c.email FROM savings_sessions s "
            "JOIN savings_users u ON u.id=s.user_id LEFT JOIN savings_credentials c ON c.user_id=u.id "
            "WHERE s.token_hash=? AND s.expires_at>?",
            (hashlib.sha256(token.encode()).hexdigest(), int(time.time())),
        ).fetchone()
    return dict(row) if row else None


def require_identity_request(request: Request) -> None:
    """Identity changes accept JSON from the app's explicitly allowed origins."""
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise HTTPException(415, "Use application/json for this request.")
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(403, "Cross-site account requests are not allowed.")
    origin = request.headers.get("origin")
    if origin:
        allowed = {
            "http://localhost:3000", "http://127.0.0.1:3000",
            "http://localhost:3100", "http://127.0.0.1:3100",
            "http://localhost:3200", "http://127.0.0.1:3200",
            f"{request.url.scheme}://{request.url.netloc}",
        }
        allowed.update(value.strip().rstrip("/") for value in os.environ.get("AJORA_AUTH_ORIGINS", "").split(",") if value.strip())
        if origin not in allowed:
            raise HTTPException(403, "This origin cannot make account requests.")
        try:
            parsed = urlsplit(origin)
        except ValueError:
            raise HTTPException(403, "This origin cannot make account requests.") from None
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise HTTPException(403, "This origin cannot make account requests.")


def current_user(request: Request, path: Path = Depends(get_savings_path)) -> dict:
    user = session_user(request, path)
    if user is None:
        raise HTTPException(401, "Sign in to continue to your savings.")
    return user


@router.get("/session", response_model=Session)
def get_session(response: Response, user: dict = Depends(current_user)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return user


@router.post("/session", status_code=201, response_model=Session, dependencies=[Depends(require_identity_request)])
def create_session(body: SessionInput, request: Request, response: Response, path: Path = Depends(get_savings_path)) -> dict:
    if session_user(request, path):
        raise HTTPException(409, "This browser already has a savings profile.")
    user = {"user_id": secrets.token_hex(16), "display_name": body.display_name}
    token = secrets.token_urlsafe(32)
    with database(path, write=True) as conn:
        conn.execute("INSERT INTO savings_users VALUES (?, ?)", (user["user_id"], user["display_name"]))
        conn.execute("INSERT INTO savings_sessions VALUES (?, ?, ?)", (
            hashlib.sha256(token.encode()).hexdigest(), user["user_id"], int(time.time()) + SESSION_SECONDS,
        ))
    response.set_cookie(COOKIE, token, httponly=True, samesite="lax", max_age=SESSION_SECONDS,
                        secure=request.url.scheme == "https" or os.environ.get("AJORA_COOKIE_SECURE") == "true")
    response.headers["Cache-Control"] = "no-store"
    return user


def load_circle(conn, circle_id: str, user: dict, *, organizer: bool = False) -> dict:
    row = conn.execute("SELECT document FROM savings_circles WHERE id=?", (circle_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Circle not found.")
    circle = hydrate_circle(json.loads(row["document"]))
    if user["user_id"] not in [m["user_id"] for m in circle["members"]]:
        raise HTTPException(403, "Only circle members can access this circle.")
    if organizer and user["user_id"] != circle["organizer_id"]:
        raise HTTPException(403, "Only the organiser can perform this action.")
    return circle


def save_circle(conn, circle: dict) -> dict:
    hydrate_circle(circle)
    conn.execute("UPDATE savings_circles SET document=? WHERE id=?", (json.dumps(circle), circle["id"]))
    return circle


def require_status(circle: dict, status: str):
    if circle["status"] != status:
        raise HTTPException(409, f"This action requires a {status} circle.")


def due_dates(start: date, frequency: str, count: int) -> list[str]:
    dates = []
    for i in range(count):
        if frequency == "weekly":
            value = start + timedelta(weeks=i)
        else:
            total_month = start.year * 12 + start.month - 1 + i
            year, month_index = divmod(total_month, 12)
            month = month_index + 1
            value = date(year, month, min(start.day, calendar.monthrange(year, month)[1]))
        dates.append(value.isoformat())
    return dates


@router.get("/circles", response_model=list[Circle])
def list_circles(user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> list[dict]:
    with database(path) as conn:
        circles = [hydrate_circle(json.loads(row["document"])) for row in conn.execute("SELECT document FROM savings_circles ORDER BY rowid DESC")]
    return [c for c in circles if any(m["user_id"] == user["user_id"] for m in c["members"])]


@router.post("/circles", status_code=201, response_model=Circle)
def create_circle(body: CreateCircle, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    circle = {
        "id": secrets.token_hex(16), "name": body.name, "organizer_id": user["user_id"],
        "contribution_kobo": body.contribution_kobo, "frequency": body.frequency,
        "member_limit": body.member_limit, "start_date": body.start_date.isoformat(), "rules": body.rules,
        "invite_code": secrets.token_hex(6).upper(), "status": "draft", "current_round": 1,
        "members": [{"user_id": user["user_id"], "display_name": user["display_name"], "position": 1}], "contributions": [], "payouts": [],
        "due_dates": due_dates(body.start_date, body.frequency, body.member_limit), "created_at": now(),
        "collection_account": None, "agreement_version": 1, "acceptances": [], "events": [],
    }
    event(circle, user, "circle_created", "Circle created with provisional payout order.")
    with database(path, write=True) as conn:
        conn.execute("INSERT INTO savings_circles VALUES (?, ?, ?)", (circle["id"], circle["invite_code"], json.dumps(circle)))
    return circle


@router.post("/join", response_model=Circle)
def join_circle(body: JoinCircle, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        row = conn.execute("SELECT document FROM savings_circles WHERE invite_code=?", (body.invite_code.upper(),)).fetchone()
        if not row:
            raise HTTPException(404, "No circle matches that invite code.")
        circle = hydrate_circle(json.loads(row["document"]))
        if any(m["user_id"] == user["user_id"] for m in circle["members"]):
            raise HTTPException(409, "You have already joined this circle.")
        require_status(circle, "draft")
        if len(circle["members"]) >= circle["member_limit"]:
            raise HTTPException(409, "This circle is full.")
        circle["members"].append({"user_id": user["user_id"], "display_name": user["display_name"], "position": len(circle["members"]) + 1})
        revise_agreement(circle, user, "Member joined; review the updated agreement.")
        return save_circle(conn, circle)


@router.get("/circles/{circle_id}", response_model=Circle)
def get_circle(circle_id: str, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path) as conn:
        return load_circle(conn, circle_id, user)


@router.post("/circles/{circle_id}/order", response_model=Circle)
def set_order(circle_id: str, body: OrderInput, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user, organizer=True)
        require_status(circle, "draft")
        members = {m["user_id"]: m for m in circle["members"]}
        if len(body.member_ids) != len(members) or set(body.member_ids) != set(members):
            raise HTTPException(422, "Payout order must contain each member exactly once.")
        if body.member_ids != [m["user_id"] for m in circle["members"]]:
            circle["members"] = [{**members[uid], "position": index + 1} for index, uid in enumerate(body.member_ids)]
            revise_agreement(circle, user, "Payout order changed; all members must accept again.")
        return save_circle(conn, circle)


@router.post("/circles/{circle_id}/start", response_model=Circle)
def start_circle(circle_id: str, body: EmptyInput, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user, organizer=True)
        require_status(circle, "draft")
        if len(circle["members"]) != circle["member_limit"]:
            raise HTTPException(409, "Fill every member place before starting the circle.")
        accepted = {a["member_id"] for a in circle["acceptances"] if a["version"] == circle["agreement_version"]}
        if accepted != {m["user_id"] for m in circle["members"]}:
            raise HTTPException(409, "Every member must accept the final agreement and payout order before starting.")
        circle["status"] = "active"
        event(circle, user, "circle_started", f"Agreement version {circle['agreement_version']} locked.")
        return save_circle(conn, circle)


@router.post("/circles/{circle_id}/contributions", response_model=Circle)
def submit_contribution(circle_id: str, body: ContributionInput, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user)
        require_status(circle, "active")
        if body.round_number != circle["current_round"]:
            raise HTTPException(409, "Submit a contribution for the current round only.")
        require_unpaid_round(circle)
        amount = body.amount_kobo if body.amount_kobo is not None else circle["contribution_kobo"]
        existing = next((c for c in circle["contributions"] if c["member_id"] == user["user_id"] and c["round_number"] == body.round_number), None)
        if existing is None:
            existing = {"member_id": user["user_id"], "round_number": body.round_number,
                "status": "submitted", "reference": body.reference, "submitted_at": now(), "confirmed_at": None,
                "rejection_reason": None, "rejected_at": None, "history": [], "payments": []}
            circle["contributions"].append(existing)
        payments = existing["payments"]
        if any(normalize_reference(p["reference"]) == normalize_reference(body.reference) and p["status"] != "rejected" for c in circle["contributions"] for p in c["payments"]):
            raise HTTPException(409, "This reference has already been submitted in this circle.")
        committed = sum(p["amount_kobo"] for p in payments if p["status"] != "rejected")
        if committed + amount > circle["contribution_kobo"]:
            raise HTTPException(409, "Payments exceed the remaining contribution for this round.")
        payments.append({"id": secrets.token_hex(12), "amount_kobo": amount, "reference": body.reference,
            "status": "submitted", "source": "manual", "receipt_id": None,
            "submitted_at": now(), "confirmed_at": None, "rejection_reason": None})
        existing.update(reference=body.reference, submitted_at=now(), rejection_reason=None, rejected_at=None)
        event(circle, user, "payment_submitted", f"Round {body.round_number}: contribution claim of {amount} kobo submitted ({body.reference}).")
        return save_circle(conn, circle)


@router.post("/circles/{circle_id}/contributions/{member_id}/{round_number}/confirm", response_model=Circle)
def confirm_contribution(circle_id: str, member_id: str, round_number: int, body: EmptyInput,
                         user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user, organizer=True)
        require_status(circle, "active")
        if round_number != circle["current_round"]:
            raise HTTPException(409, "Confirm a contribution for the current round only.")
        contribution = next((c for c in circle["contributions"] if c["member_id"] == member_id and c["round_number"] == round_number), None)
        if not contribution:
            raise HTTPException(404, "This member has not submitted a contribution for this round.")
        if contribution["status"] != "submitted":
            raise HTTPException(409, "Only a submitted contribution can be confirmed.")
        require_unpaid_round(circle)
        for payment in contribution["payments"]:
            if payment["status"] == "submitted":
                payment.update(status="confirmed", confirmed_at=now(), source="manual")
        event(circle, user, "payment_confirmed", f"Round {round_number}: organiser manually confirmed {member_id}'s submitted payments.")
        return save_circle(conn, circle)


@router.post("/circles/{circle_id}/payouts", response_model=Circle)
def record_payout(circle_id: str, body: PayoutInput, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user, organizer=True)
        require_status(circle, "active")
        number = circle["current_round"]
        if body.round_number != number:
            raise HTTPException(409, "Record a payout for the current round only.")
        if any(p["round_number"] == number for p in circle["payouts"]):
            raise HTTPException(409, "A payout has already been reported for this round.")
        if any(normalize_reference(p["reference"]) == normalize_reference(body.reference) for p in circle["payouts"]):
            raise HTTPException(409, "This payout reference has already been recorded.")
        confirmed = [c for c in circle["contributions"] if c["round_number"] == number and c["confirmed_kobo"] == circle["contribution_kobo"]]
        if len(confirmed) != circle["member_limit"]:
            raise HTTPException(409, "Confirm every member's full contribution before recording a payout.")
        recipient = circle["members"][number - 1]
        circle["payouts"].append({"round_number": number, "member_id": recipient["user_id"],
            "amount_kobo": circle["contribution_kobo"] * circle["member_limit"], "reference": body.reference,
            "recorded_at": now(), "status": "sent", "received_at": None, "dispute_reason": None})
        event(circle, user, "payout_sent", f"Round {number}: organiser reported payout sent to {recipient['display_name']}; receipt pending.")
        return save_circle(conn, circle)


@router.get("/invitations/{invite_code}", response_model=InvitationPreview)
def preview_invitation(invite_code: str, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    """Show the agreement before joining, without exposing member identities."""
    with database(path) as conn:
        row = conn.execute("SELECT document FROM savings_circles WHERE invite_code=?", (invite_code.strip().upper(),)).fetchone()
    if not row:
        raise HTTPException(404, "No circle matches that invite code.")
    circle = json.loads(row["document"])
    return {**{key: circle[key] for key in ("name", "contribution_kobo", "frequency", "member_limit", "start_date", "rules", "status")},
            "member_count": len(circle["members"])}


@router.post("/circles/{circle_id}/contributions/{member_id}/{round_number}/reject", response_model=Circle)
def reject_contribution(circle_id: str, member_id: str, round_number: int, body: RejectInput,
                        user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user, organizer=True)
        require_status(circle, "active")
        if round_number != circle["current_round"]:
            raise HTTPException(409, "Reject a contribution for the current round only.")
        contribution = next((c for c in circle["contributions"] if c["member_id"] == member_id and c["round_number"] == round_number), None)
        if not contribution:
            raise HTTPException(404, "This member has not submitted a contribution for this round.")
        if contribution["status"] != "submitted":
            raise HTTPException(409, "Only a submitted contribution can be rejected.")
        require_unpaid_round(circle)
        for payment in contribution["payments"]:
            if payment["status"] == "submitted":
                payment.update(status="rejected", rejection_reason=body.reason)
        contribution["history"].append({"reference": contribution["reference"], "submitted_at": contribution["submitted_at"],
            "rejected_at": now(), "rejection_reason": body.reason})
        contribution.update(rejected_at=now(), rejection_reason=body.reason)
        event(circle, user, "payment_rejected", f"Round {round_number}: claim from {member_id} rejected: {body.reason}")
        return save_circle(conn, circle)


def normalize_reference(reference: str) -> str:
    return reference.strip().casefold()


def hydrate_circle(circle: dict) -> dict:
    """Read legacy documents without treating historical records as bank proof."""
    circle.setdefault("collection_account", None)
    circle.setdefault("agreement_version", 1)
    circle.setdefault("acceptances", [])
    circle.setdefault("events", [])
    for payout in circle["payouts"]:
        payout.setdefault("status", "legacy_recorded")
        payout.setdefault("received_at", None)
        payout.setdefault("dispute_reason", None)
    for claim in circle["contributions"]:
        if "payments" not in claim:
            claim["payments"] = [{"id": f"legacy:{claim['member_id']}:{claim['round_number']}",
                "amount_kobo": circle["contribution_kobo"], "reference": claim["reference"],
                "status": claim["status"], "source": "manual", "receipt_id": None,
                "submitted_at": claim["submitted_at"], "confirmed_at": claim.get("confirmed_at"),
                "rejection_reason": claim.get("rejection_reason")}]
        confirmed = [p for p in claim["payments"] if p["status"] == "confirmed"]
        claim["confirmed_kobo"] = sum(p["amount_kobo"] for p in confirmed)
        claim["matched_kobo"] = sum(p["amount_kobo"] for p in confirmed if p["source"] == "demo")
        claim["status"] = ("confirmed" if claim["confirmed_kobo"] == circle["contribution_kobo"] else
            "submitted" if any(p["status"] != "rejected" for p in claim["payments"]) else "rejected")
        claim["confirmed_at"] = max((p["confirmed_at"] for p in confirmed), default=None) if claim["status"] == "confirmed" else None
    return circle


def event(circle: dict, user: dict, kind: str, detail: str):
    circle["events"].append({"id": secrets.token_hex(12), "kind": kind,
        "actor_id": user["user_id"], "at": now(), "detail": detail})


def revise_agreement(circle: dict, user: dict, detail: str):
    circle["agreement_version"] += 1
    circle["acceptances"] = []
    event(circle, user, "agreement_revised", detail)
    circle["events"][-1]["agreement"] = agreement_snapshot(circle)


def require_unpaid_round(circle: dict):
    if any(p["round_number"] == circle["current_round"] for p in circle["payouts"]):
        raise HTTPException(409, "This round's payout has been reported; payment records are locked.")


def find_payment(circle: dict, payment_id: str, *, current_only: bool = True) -> tuple[dict, dict]:
    for claim in circle["contributions"]:
        for payment in claim["payments"]:
            if payment["id"] == payment_id:
                if current_only and claim["round_number"] != circle["current_round"]:
                    raise HTTPException(409, "Only current-round payments can be changed.")
                return claim, payment
    raise HTTPException(404, "Payment not found.")


@router.post("/circles/{circle_id}/collection-account", response_model=Circle)
def set_collection_account(circle_id: str, body: CollectionAccount, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user, organizer=True)
        require_status(circle, "draft")
        account = body.model_dump()
        if circle["collection_account"] != account:
            circle["collection_account"] = account
            revise_agreement(circle, user, "Demo collection account changed; all members must accept again.")
        return save_circle(conn, circle)


@router.post("/circles/{circle_id}/agreement/accept", response_model=Circle)
def accept_agreement(circle_id: str, body: AgreementInput, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user)
        require_status(circle, "draft")
        if body.version != circle["agreement_version"]:
            raise HTTPException(409, "The agreement changed. Review it again before accepting.")
        if not any(a["member_id"] == user["user_id"] and a["version"] == body.version for a in circle["acceptances"]):
            circle["acceptances"].append({"member_id": user["user_id"], "version": body.version, "accepted_at": now()})
            order = ", ".join(f"{m['position']}: {m['display_name']}" for m in circle["members"])
            event(circle, user, "agreement_accepted", f"Accepted version {body.version}; payout order {order}.")
            circle["events"][-1]["agreement"] = agreement_snapshot(circle)
        return save_circle(conn, circle)


def candidate_matches(circle: dict, feed: BankFeed, allocated: set[str]) -> list[dict]:
    """Suggest only a unique exact reference/amount; ambiguous claims stay manual."""
    pending = [p for c in circle["contributions"] if c["round_number"] == circle["current_round"]
        for p in c["payments"] if p["status"] == "submitted"]
    matches = []
    for payment in pending:
        candidates = [t for t in feed.transactions if t.id not in allocated and
            t.amount_kobo == payment["amount_kobo"] and normalize_reference(t.reference) == normalize_reference(payment["reference"])]
        if len(candidates) != 1:
            continue
        receipt = candidates[0]
        competing = [p for p in pending if p["amount_kobo"] == receipt.amount_kobo and
            normalize_reference(p["reference"]) == normalize_reference(receipt.reference)]
        if len(competing) == 1:
            matches.append({"payment_id": payment["id"], "transaction_id": receipt.id})
    return matches


def get_feed(circle: dict, provider, conn) -> BankFeed:
    if not circle["collection_account"]:
        raise HTTPException(409, "Configure a demo collection account before loading the feed.")
    feed = provider.get_feed(circle)
    if feed.account_id != circle["collection_account"]["account_id"] or feed.source != circle["collection_account"]["source"]:
        raise HTTPException(409, "The feed does not match the circle collection account.")
    allocated = {r["receipt_id"] for r in conn.execute("SELECT receipt_id FROM savings_receipts WHERE source=? AND account_id=?", (feed.source, feed.account_id))}
    feed.matches = [MatchCandidate(**match) for match in candidate_matches(circle, feed, allocated)]
    return feed


@router.get("/circles/{circle_id}/bank-feed", response_model=BankFeed)
def bank_feed(circle_id: str, user: dict = Depends(current_user), path: Path = Depends(get_savings_path),
              provider=Depends(get_bank_feed_provider)) -> BankFeed:
    with database(path) as conn:
        circle = load_circle(conn, circle_id, user, organizer=True)
        require_status(circle, "active")
        return get_feed(circle, provider, conn)


@router.post("/circles/{circle_id}/payments/{payment_id}/match", response_model=Circle)
def match_payment(circle_id: str, payment_id: str, body: MatchInput, user: dict = Depends(current_user),
                  path: Path = Depends(get_savings_path), provider=Depends(get_bank_feed_provider)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user, organizer=True)
        require_status(circle, "active")
        require_unpaid_round(circle)
        _, payment = find_payment(circle, payment_id)
        if payment["status"] != "submitted":
            raise HTTPException(409, "Only a submitted payment can be matched.")
        feed = get_feed(circle, provider, conn)
        if not any(m.payment_id == payment_id and m.transaction_id == body.transaction_id for m in feed.matches):
            raise HTTPException(409, "No unique, unused reference-and-amount match exists in the current feed.")
        try:
            conn.execute("INSERT INTO savings_receipts VALUES (?, ?, ?, ?, ?)",
                (feed.source, feed.account_id, body.transaction_id, circle_id, payment_id))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "This bank receipt is already allocated.")
        payment.update(status="confirmed", source=feed.source, receipt_id=body.transaction_id, confirmed_at=now())
        event(circle, user, "demo_match_approved", f"Approved simulated receipt for {payment['amount_kobo']} kobo ({payment['reference']}); not verification of a real payment.")
        return save_circle(conn, circle)


@router.post("/circles/{circle_id}/payments/{payment_id}/confirm", response_model=Circle)
def confirm_payment(circle_id: str, payment_id: str, body: EmptyInput, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user, organizer=True)
        require_status(circle, "active")
        require_unpaid_round(circle)
        _, payment = find_payment(circle, payment_id)
        if payment["status"] != "submitted":
            raise HTTPException(409, "Only a submitted payment can be manually confirmed.")
        payment.update(status="confirmed", source="manual", confirmed_at=now())
        event(circle, user, "payment_confirmed", f"Organiser manually confirmed {payment['amount_kobo']} kobo ({payment['reference']}).")
        return save_circle(conn, circle)


@router.post("/circles/{circle_id}/payments/{payment_id}/reject", response_model=Circle)
def reject_payment(circle_id: str, payment_id: str, body: RejectInput, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user, organizer=True)
        require_status(circle, "active")
        require_unpaid_round(circle)
        claim, payment = find_payment(circle, payment_id)
        if payment["status"] != "submitted":
            raise HTTPException(409, "Only submitted payments can be rejected.")
        payment.update(status="rejected", rejection_reason=body.reason)
        claim["history"].append({"reference": payment["reference"], "submitted_at": payment["submitted_at"],
            "rejected_at": now(), "rejection_reason": body.reason})
        claim.update(rejected_at=now(), rejection_reason=body.reason)
        event(circle, user, "payment_rejected", f"Rejected {payment['reference']}: {body.reason}")
        return save_circle(conn, circle)


@router.post("/circles/{circle_id}/payments/{payment_id}/revoke", response_model=Circle)
def revoke_payment(circle_id: str, payment_id: str, body: RejectInput, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user, organizer=True)
        require_status(circle, "active")
        require_unpaid_round(circle)
        _, payment = find_payment(circle, payment_id)
        if payment["status"] != "confirmed":
            raise HTTPException(409, "Only confirmed payments can be corrected.")
        conn.execute("DELETE FROM savings_receipts WHERE circle_id=? AND payment_id=?", (circle_id, payment_id))
        event(circle, user, "payment_confirmation_revoked", f"Revoked {payment['source']} confirmation ({payment['reference']}, receipt {payment['receipt_id']}): {body.reason}")
        payment.update(status="submitted", source="manual", receipt_id=None, confirmed_at=None)
        return save_circle(conn, circle)


@router.post("/circles/{circle_id}/payments/{payment_id}/dispute", response_model=Circle)
def dispute_payment(circle_id: str, payment_id: str, body: RejectInput, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user)
        _, payment = find_payment(circle, payment_id, current_only=False)
        event(circle, user, "payment_disputed", f"Flagged {payment['reference']}: {body.reason}")
        return save_circle(conn, circle)


@router.post("/circles/{circle_id}/payouts/{round_number}/receive", response_model=Circle)
def receive_payout(circle_id: str, round_number: int, body: EmptyInput, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user)
        payout = next((p for p in circle["payouts"] if p["round_number"] == round_number), None)
        if not payout:
            raise HTTPException(404, "Payout not found.")
        if payout["member_id"] != user["user_id"]:
            raise HTTPException(403, "Only the payout recipient can confirm receipt.")
        if payout["status"] == "received":
            return circle
        if payout["status"] == "legacy_recorded":
            raise HTTPException(409, "Historical payout records cannot advance this circle again.")
        if circle["status"] != "active" or round_number != circle["current_round"]:
            raise HTTPException(409, "Only the current payout can advance the circle.")
        payout.update(status="received", received_at=now())
        event(circle, user, "payout_received", f"Round {round_number}: recipient confirmed receiving {payout['amount_kobo']} kobo.")
        if round_number == circle["member_limit"]:
            circle["status"] = "completed"
        else:
            circle["current_round"] += 1
        return save_circle(conn, circle)


@router.post("/circles/{circle_id}/payouts/{round_number}/dispute", response_model=Circle)
def dispute_payout(circle_id: str, round_number: int, body: RejectInput, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user)
        payout = next((p for p in circle["payouts"] if p["round_number"] == round_number), None)
        if not payout:
            raise HTTPException(404, "Payout not found.")
        if payout["member_id"] != user["user_id"]:
            raise HTTPException(403, "Only the payout recipient can dispute receipt.")
        if payout["status"] not in ("sent", "disputed"):
            raise HTTPException(409, "Only a payout awaiting receipt can be disputed.")
        payout.update(status="disputed", dispute_reason=body.reason)
        event(circle, user, "payout_disputed", f"Round {round_number}: recipient reported a payout problem: {body.reason}")
        return save_circle(conn, circle)


def agreement_snapshot(circle: dict) -> dict:
    return {key: json.loads(json.dumps(circle[key])) for key in (
        "agreement_version", "contribution_kobo", "frequency", "start_date", "rules", "members", "collection_account")}

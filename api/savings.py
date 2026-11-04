"""Persistent ajo tracker. External payments are recorded, never executed here.

A browser session owns a generated identity; display names are not authentication.
This MVP has no cross-device login or recovery. Raw bank data stays in the separate
stateless insights engine. SQLite holds only circle agreements and payment records.
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

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

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


class PayoutInput(ContributionInput):
    pass


class RejectInput(Input):
    reason: str = Field(min_length=3, max_length=500)


class EmptyInput(Input):
    pass


class Session(BaseModel):
    user_id: str
    display_name: str


class Member(Session):
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


class Payout(BaseModel):
    round_number: int
    member_id: str
    amount_kobo: int
    reference: str
    recorded_at: str


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
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=15)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS savings_users (
                id TEXT PRIMARY KEY, display_name TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS savings_sessions (
                token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL
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
            "SELECT u.id AS user_id, u.display_name FROM savings_sessions s JOIN savings_users u ON u.id=s.user_id "
            "WHERE s.token_hash=? AND s.expires_at>?",
            (hashlib.sha256(token.encode()).hexdigest(), int(time.time())),
        ).fetchone()
    return dict(row) if row else None


def current_user(request: Request, path: Path = Depends(get_savings_path)) -> dict:
    user = session_user(request, path)
    if user is None:
        raise HTTPException(401, "Create a savings profile in this browser to continue.")
    return user


@router.get("/session", response_model=Session)
def get_session(user: dict = Depends(current_user)) -> dict:
    return user


@router.post("/session", status_code=201, response_model=Session)
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
    return user


def load_circle(conn, circle_id: str, user: dict, *, organizer: bool = False) -> dict:
    row = conn.execute("SELECT document FROM savings_circles WHERE id=?", (circle_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Circle not found.")
    circle = json.loads(row["document"])
    if user["user_id"] not in [m["user_id"] for m in circle["members"]]:
        raise HTTPException(403, "Only circle members can access this circle.")
    if organizer and user["user_id"] != circle["organizer_id"]:
        raise HTTPException(403, "Only the organiser can perform this action.")
    return circle


def save_circle(conn, circle: dict) -> dict:
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
        circles = [json.loads(row["document"]) for row in conn.execute("SELECT document FROM savings_circles ORDER BY rowid DESC")]
    return [c for c in circles if any(m["user_id"] == user["user_id"] for m in c["members"])]


@router.post("/circles", status_code=201, response_model=Circle)
def create_circle(body: CreateCircle, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    circle = {
        "id": secrets.token_hex(16), "name": body.name, "organizer_id": user["user_id"],
        "contribution_kobo": body.contribution_kobo, "frequency": body.frequency,
        "member_limit": body.member_limit, "start_date": body.start_date.isoformat(), "rules": body.rules,
        "invite_code": secrets.token_hex(6).upper(), "status": "draft", "current_round": 1,
        "members": [{**user, "position": 1}], "contributions": [], "payouts": [],
        "due_dates": due_dates(body.start_date, body.frequency, body.member_limit), "created_at": now(),
    }
    with database(path, write=True) as conn:
        conn.execute("INSERT INTO savings_circles VALUES (?, ?, ?)", (circle["id"], circle["invite_code"], json.dumps(circle)))
    return circle


@router.post("/join", response_model=Circle)
def join_circle(body: JoinCircle, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        row = conn.execute("SELECT document FROM savings_circles WHERE invite_code=?", (body.invite_code.upper(),)).fetchone()
        if not row:
            raise HTTPException(404, "No circle matches that invite code.")
        circle = json.loads(row["document"])
        if any(m["user_id"] == user["user_id"] for m in circle["members"]):
            raise HTTPException(409, "You have already joined this circle.")
        require_status(circle, "draft")
        if len(circle["members"]) >= circle["member_limit"]:
            raise HTTPException(409, "This circle is full.")
        circle["members"].append({**user, "position": len(circle["members"]) + 1})
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
        circle["members"] = [{**members[uid], "position": index + 1} for index, uid in enumerate(body.member_ids)]
        return save_circle(conn, circle)


@router.post("/circles/{circle_id}/start", response_model=Circle)
def start_circle(circle_id: str, body: EmptyInput, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user, organizer=True)
        require_status(circle, "draft")
        if len(circle["members"]) != circle["member_limit"]:
            raise HTTPException(409, "Fill every member place before starting the circle.")
        circle["status"] = "active"
        return save_circle(conn, circle)


@router.post("/circles/{circle_id}/contributions", response_model=Circle)
def submit_contribution(circle_id: str, body: ContributionInput, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user)
        require_status(circle, "active")
        if body.round_number != circle["current_round"]:
            raise HTTPException(409, "Submit a contribution for the current round only.")
        existing = next((c for c in circle["contributions"] if c["member_id"] == user["user_id"] and c["round_number"] == body.round_number), None)
        if existing and existing["status"] != "rejected":
            raise HTTPException(409, "Your contribution for this round has already been submitted.")
        claim = {"member_id": user["user_id"], "round_number": body.round_number,
            "status": "submitted", "reference": body.reference, "submitted_at": now(), "confirmed_at": None,
            "rejection_reason": None, "rejected_at": None, "history": []}
        if existing:
            claim["history"] = existing.get("history", []) + [{key: existing[key] for key in ("reference", "submitted_at", "rejected_at", "rejection_reason")}]
            existing.clear()
            existing.update(claim)
        else:
            circle["contributions"].append(claim)
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
        contribution.update(status="confirmed", confirmed_at=now())
        return save_circle(conn, circle)


@router.post("/circles/{circle_id}/payouts", response_model=Circle)
def record_payout(circle_id: str, body: PayoutInput, user: dict = Depends(current_user), path: Path = Depends(get_savings_path)) -> dict:
    with database(path, write=True) as conn:
        circle = load_circle(conn, circle_id, user, organizer=True)
        require_status(circle, "active")
        number = circle["current_round"]
        if body.round_number != number:
            raise HTTPException(409, "Record a payout for the current round only.")
        if any(p["reference"] == body.reference for p in circle["payouts"]):
            raise HTTPException(409, "This payout reference has already been recorded.")
        confirmed = [c for c in circle["contributions"] if c["round_number"] == number and c["status"] == "confirmed"]
        if len(confirmed) != circle["member_limit"]:
            raise HTTPException(409, "Confirm every member's contribution before recording a payout.")
        recipient = circle["members"][number - 1]
        circle["payouts"].append({"round_number": number, "member_id": recipient["user_id"],
            "amount_kobo": circle["contribution_kobo"] * circle["member_limit"], "reference": body.reference, "recorded_at": now()})
        if number == circle["member_limit"]:
            circle["status"] = "completed"
        else:
            circle["current_round"] += 1
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
        contribution.update(status="rejected", rejected_at=now(), rejection_reason=body.reason)
        return save_circle(conn, circle)

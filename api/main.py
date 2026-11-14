"""Ajora API application entrypoint.

Run locally with::

    .venv/bin/python -m uvicorn api.main:app --reload

OpenAPI docs render at ``/docs``. Savings circles use durable SQLite records;
the optional bank-insights engine remains stateless.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
import json
import logging
import os
import re
from secrets import compare_digest
import sqlite3
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from engine.dedup import UnsupportedCurrencyError

from .routes import router
from .savings import router as savings_router, get_savings_path
from .savings_export import router as savings_export_router
from .savings_identity import router as savings_identity_router
from .auth import router as auth_router
from .account_email import router as account_email_router
from .google_auth import router as google_auth_router
from .demo_account import seed_demo_account
from .savings_storage import StorageConfigurationError, connect_savings

logger = logging.getLogger("uvicorn.error")
_STAGING_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_-]{43,128}")

# The Next.js dev server. Explicit list (not "*") because credentials are allowed.
# Note: the frontend normally reaches the API through its same-origin `/api/engine`
# proxy (see web/next.config.ts), so CORS doesn't apply to it; this list only matters
# for *direct* browser calls. :3200 is current; retain earlier local dev origins.
_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3100",
    "http://127.0.0.1:3100",
    "http://localhost:3200",
    "http://127.0.0.1:3200",
]

@asynccontextmanager
async def lifespan(_app: FastAPI):
    seed_demo_account(get_savings_path())
    yield


app = FastAPI(
    lifespan=lifespan,
    title="Ajora API",
    version="0.1.0",
    description=(
        "Ajo savings circles, contribution tracking and payout turns for Nigeria. "
        "Tracks external payments, demo receipt matching, and recipient-confirmed payouts; optional bank insights "
        "remain available through the stateless engine."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_DEV_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(savings_router)
app.include_router(savings_export_router)
app.include_router(savings_identity_router)
app.include_router(auth_router)
app.include_router(account_email_router)
app.include_router(google_auth_router)


@app.middleware("http")
async def request_summary(request: Request, call_next):
    request_id = uuid4().hex
    started = perf_counter()
    path = request.scope["path"]
    private = path.startswith(("/savings/", "/auth/"))
    staging_token = os.environ.get("AJORA_STAGING_ACCESS_TOKEN")
    staging_required = os.environ.get("AJORA_STAGING_ACCESS_REQUIRED", "false").strip().lower() != "false"
    staging_protected = staging_required or staging_token is not None
    liveness = path == "/health" and request.method in {"GET", "HEAD"}
    error_type = None
    try:
        if staging_protected and not liveness and (
            staging_token is None or not _STAGING_TOKEN_PATTERN.fullmatch(staging_token)
            or not compare_digest(staging_token.encode(), request.headers.get("X-Ajora-Staging-Access", "").encode())
        ):
            response = JSONResponse(status_code=403, content={"detail": "Staging access is restricted."})
        else:
            response = await call_next(request)
    except (sqlite3.OperationalError, StorageConfigurationError):
        error_type = "storage_unavailable"
        response = JSONResponse(status_code=503, content={
            "detail": "Savings storage is temporarily unavailable. Check the latest record before trying again.",
        })
    except Exception as exc:
        error_type = type(exc).__name__
        response = JSONResponse(status_code=500, content={"detail": "The request could not be completed."})
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    if private or staging_protected or path in {"/health", "/ready"} or response.status_code >= 500:
        response.headers["Cache-Control"] = "no-store"
    route = request.scope.get("route")
    summary = {
        "request_id": request_id,
        "method": request.method,
        "route": getattr(route, "path", "unmatched"),
        "status": response.status_code,
        "duration_ms": round((perf_counter() - started) * 1000, 1),
    }
    if error_type:
        summary["error"] = error_type
    logger.log(logging.WARNING if response.status_code >= 500 else logging.INFO, "%s", json.dumps(summary))
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    path = request.scope["path"]
    if path == "/savings/recover":
        # Recovery keys grant account access, so redact them like passwords.
        return JSONResponse(status_code=422, content={
            "detail": "Enter a valid recovery key.",
        }, headers={"Cache-Control": "no-store"})
    if path.startswith("/auth/"):
        # FastAPI's default validation response includes submitted field values.
        # Keep password-bearing requests out of responses and client error logs.
        return JSONResponse(status_code=422, content={
            "detail": ("Google sign-in could not be completed. Please try again."
                       if path.startswith("/auth/google") else
                       "Enter a valid link and a new password of 15–128 characters."
                       if path == "/auth/password/reset" else
                       "Enter a valid verification link."
                       if path == "/auth/email/verify" else
                       "Enter a valid email address."
                       if path == "/auth/password/forgot" else
                       "Enter a valid email and password. New passwords need 15–128 characters; names need 2–80 characters."),
        }, headers={"Cache-Control": "no-store"})
    if path.startswith("/savings/"):
        return JSONResponse(status_code=422, content={"detail": "Check the fields and try again."})
    from fastapi.exception_handlers import request_validation_exception_handler
    return await request_validation_exception_handler(request, exc)


@app.exception_handler(UnsupportedCurrencyError)
async def missing_exchange_rate(_request: Request, exc: UnsupportedCurrencyError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/health", tags=["meta"])
@app.head("/health", include_in_schema=False)
def health() -> dict:
    """Process liveness, independent of analytics and savings storage."""
    return {"status": "ok"}


@app.get("/ready", tags=["meta"])
def ready():
    """Check that the configured savings store can read its existing schema."""
    path = get_savings_path()
    if not path.is_file() and "TURSO_DATABASE_URL" not in os.environ and "TURSO_AUTH_TOKEN" not in os.environ:
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    try:
        conn = connect_savings(path)
        try:
            conn.execute("SELECT id FROM savings_circles LIMIT 1").fetchone()
        finally:
            conn.close()
    except (sqlite3.Error, StorageConfigurationError):
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return {"status": "ready"}

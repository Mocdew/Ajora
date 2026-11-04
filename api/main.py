"""Ajora API application entrypoint.

Run locally with::

    .venv/bin/python -m uvicorn api.main:app --reload

OpenAPI docs render at ``/docs``. Savings circles use durable SQLite records;
the optional bank-insights engine remains stateless.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from engine.dedup import UnsupportedCurrencyError

from .deps import get_provider
from .routes import router
from .savings import router as savings_router, get_savings_path
from .savings_identity import router as savings_identity_router
from .auth import router as auth_router
from .google_auth import router as google_auth_router
from .demo_account import seed_demo_account

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
app.include_router(savings_identity_router)
app.include_router(auth_router)
app.include_router(google_auth_router)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    if request.url.path == "/savings/recover":
        # Recovery keys grant account access, so redact them like passwords.
        return JSONResponse(status_code=422, content={
            "detail": "Enter a valid recovery key.",
        }, headers={"Cache-Control": "no-store"})
    if request.url.path.startswith("/auth/"):
        # FastAPI's default validation response includes submitted field values.
        # Keep password-bearing requests out of responses and client error logs.
        return JSONResponse(status_code=422, content={
            "detail": ("Google sign-in could not be completed. Please try again."
                       if request.url.path.startswith("/auth/google") else
                       "Enter a valid email and password. New passwords need 15–128 characters; names need 2–80 characters."),
        }, headers={"Cache-Control": "no-store"})
    from fastapi.exception_handlers import request_validation_exception_handler
    return await request_validation_exception_handler(request, exc)


@app.exception_handler(UnsupportedCurrencyError)
async def missing_exchange_rate(_request: Request, exc: UnsupportedCurrencyError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/health", tags=["meta"])
def health() -> dict:
    """Liveness probe + the set of personas this instance can serve."""
    return {"status": "ok", "users": get_provider().list_users()}

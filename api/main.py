"""Ajora API application entrypoint.

Run locally with::

    .venv/bin/python -m uvicorn api.main:app --reload

OpenAPI docs render at ``/docs``. The app wires the engine pipeline behind four
read-only endpoints and adds CORS for the Next.js dev origin.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from engine.dedup import UnsupportedCurrencyError

from .deps import get_provider
from .routes import router

# The Next.js dev server. Explicit list (not "*") because credentials are allowed.
# Note: the frontend normally reaches the API through its same-origin `/api/engine`
# proxy (see web/next.config.ts), so CORS doesn't apply to it; this list only matters
# for *direct* browser calls. :3000 and :3100 are both dev origins the app has used.
_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3100",
    "http://127.0.0.1:3100",
]

app = FastAPI(
    title="Ajora API",
    version="0.1.0",
    description=(
        "Consent-first multi-bank financial insights for Nigeria. Serves cross-"
        "institution transfer-deduped cashflow and communal-finance insights "
        "(ajo/esusu, dependents, informal lending, remittance) over the stateless "
        "engine pipeline."
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


@app.exception_handler(UnsupportedCurrencyError)
async def missing_exchange_rate(_request: Request, exc: UnsupportedCurrencyError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/health", tags=["meta"])
def health() -> dict:
    """Liveness probe + the set of personas this instance can serve."""
    return {"status": "ok", "users": get_provider().list_users()}

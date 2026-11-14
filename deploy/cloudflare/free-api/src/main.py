"""Private Python Worker entrypoint for Ajora's staging and production APIs."""

from ipaddress import ip_address
import os
import re
from secrets import compare_digest

# Load FastAPI in the startup snapshot and let the Worker SDK patch AnyIO's
# thread dispatch before it is first used by a request.
import fastapi  # noqa: F401
import anyio.to_thread  # noqa: F401
from workers import DurableObject, Response, WorkerEntrypoint, asgi


os.environ.setdefault("RAPIDFUZZ_IMPLEMENTATION", "python")

STAGING_DB = "libsql://ajora-p0-staging-olumide.aws-us-west-2.turso.io"
PRODUCTION_DB = "libsql://ajora-savings-olumide.aws-us-west-2.turso.io"
STAGING_ORIGINS = (
    "https://ajora-staging-web.anthonyerinfolami.workers.dev",
    "https://ajora-staging-api-check.anthonyerinfolami.workers.dev",
)
PRODUCTION_ORIGIN = re.compile(r"https://[a-z0-9-]+(?:\.[a-z0-9-]+)+")
SECRET_PATTERN = re.compile(r"[A-Za-z0-9_-]{43,128}")


def _rejected(status, detail):
    return Response.json({"detail": detail}, status=status, headers={"Cache-Control": "no-store"})


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        environment = self.env.AJORA_DEPLOYMENT_ENV
        if environment == "staging":
            token = getattr(self.env, "AJORA_STAGING_ACCESS_TOKEN", None)
            provided = request.headers.get("X-Ajora-Staging-Access", "")
        elif environment == "production":
            token = getattr(self.env, "AJORA_PRODUCTION_RELAY_TOKEN", None)
            provided = request.headers.get("X-Ajora-Production-Access", "")
        else:
            return _rejected(503, "API is unavailable.")
        if not isinstance(token, str) or not SECRET_PATTERN.fullmatch(token):
            return _rejected(503, "API is unavailable.")
        if not compare_digest(token.encode(), provided.encode()):
            return _rejected(403, "API access is restricted.")
        # The Worker provides ingress. The Durable Object runs the unchanged
        # password work factor and analytics with its larger CPU allowance.
        return await self.env.AJORA_API_COMPUTE.getByName(environment).fetch(request.js_object)


async def _app(scope, receive, send):
    from api.main import app

    if scope["type"] == "http":
        request = dict(scope["headers"])
        # The frontend service binding strips caller-supplied proxy headers.
        # Only the authenticated relay may set the internal client address.
        address = request.get(b"x-ajora-client-ip", b"")
        try:
            scope["client"] = (str(ip_address(address.decode("ascii"))), 0)
        except ValueError:
            scope["client"] = ("unknown", 0)
    await app(scope, receive, send)


class AjoraApiCompute(DurableObject):
    async def fetch(self, request):
        environment = self.env.AJORA_DEPLOYMENT_ENV
        url = getattr(self.env, "TURSO_DATABASE_URL", None)
        token = getattr(self.env, "TURSO_AUTH_TOKEN", None)
        if not isinstance(token, str) or not token.strip():
            return _rejected(503, "API is unavailable.")
        if environment == "staging" and url == STAGING_DB:
            origins = ",".join(STAGING_ORIGINS)
            os.environ.update({
                "AJORA_STAGING_ACCESS_REQUIRED": "true",
                "AJORA_STAGING_ACCESS_TOKEN": self.env.AJORA_STAGING_ACCESS_TOKEN,
                "AJORA_MANUAL_SAVINGS_ENABLED": "true",
            })
        elif environment == "production" and url == PRODUCTION_DB:
            origins = getattr(self.env, "AJORA_PRODUCTION_WEB_ORIGIN", None)
            if not isinstance(origins, str) or not PRODUCTION_ORIGIN.fullmatch(origins):
                return _rejected(503, "API is unavailable.")
            origin = request.headers.get("Origin")
            is_change = request.method not in {"GET", "HEAD", "OPTIONS"}
            if is_change and (request.headers.get("Sec-Fetch-Site") == "cross-site" or (origin and origin != origins)):
                return _rejected(403, "This origin cannot make account requests.")
            os.environ.update({
                "AJORA_MANUAL_SAVINGS_ENABLED": "false",
                "AJORA_PUBLIC_WEB_URL": origins,
                "AJORA_EMAIL_FROM": self.env.AJORA_EMAIL_FROM,
                "AJORA_RESEND_API_KEY": self.env.AJORA_RESEND_API_KEY,
            })
        else:
            return _rejected(503, "API is unavailable.")

        os.environ.update({
            "AJORA_AUTH_ORIGINS": origins,
            "AJORA_COOKIE_SECURE": "true",
            "AJORA_EXPLAINER": "offline",
            "AJORA_REQUIRE_REMOTE_SAVINGS": "true",
            "AJORA_STATE_DIR": f"/tmp/ajora-{environment}",
            "TURSO_AUTH_TOKEN": token,
            "TURSO_DATABASE_URL": url,
        })
        return await asgi.fetch(_app, request, self.env, self.ctx)

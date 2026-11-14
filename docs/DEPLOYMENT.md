# Deploying Ajora

The free demo setup runs the Next.js frontend on Vercel and the FastAPI service
on Render's free plan. Configure Turso managed SQLite as the authoritative store
for account credentials, sessions, and circle records. Remote writes must commit
before the API returns success, and failures never fall back to a local file.
The Blueprint sets `AJORA_REQUIRE_REMOTE_SAVINGS=true`, so missing remote
configuration fails instead of accepting savings writes to temporary local
SQLite. Local development defaults to SQLite with both Turso variables and this
guard unset. Local analytics JSONL logs remain temporary
even with Turso configured. No persistent disk is configured. Raw bank
transactions remain in memory. Vercel Functions cannot provide persistent local
SQLite storage, so the API runs separately.
See [Vercel's SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).

Follow [Durable savings on free hosting](TURSO_STORAGE.md) for the approved Turso
database, credentials, backup, cutover, and persistence checks. No live data
migration or storage cutover has been performed as part of this repository update.

Commit and push the application and deployment configuration to GitHub's `main`
branch before importing it into the connected hosting accounts. Local files
alone are not available to Vercel or Render builds.

## 1. Host the API

If an API running the current account and savings endpoints is already hosted,
use its HTTPS root URL.
Otherwise, import this repository as a Render Blueprint using the root
`render.yaml`. It defines a Docker service built from `Dockerfile.api` with these
settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Plan | Free |
| API port | `8000` |
| Health check | `/health` |
| State directory | `/tmp/ajora-state` |
| Hosted savings database | Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` together on the API |
| Require remote savings | `AJORA_REQUIRE_REMOTE_SAVINGS=true` |
| New manual circles on the public demo | `AJORA_MANUAL_SAVINGS_ENABLED=false` |
| Persistent disk | None |
| Secure session cookies | `AJORA_COOKIE_SECURE=true` |
| Allowed frontend origins | Set `AJORA_AUTH_ORIGINS` to the exact public frontend origin(s) |
| Automatic deployments | After the connected branch's checks pass |

The Blueprint creates a new free Docker service from this repository's `main`
branch. It does not change an existing Render demo service. The Turso settings
use `sync: false`; supply their values in Render, keeping the token private and
out of frontend variables. The required-remote guard rejects missing Turso
settings; partial or invalid configuration also fails clearly. Keep the guard
enabled on the hosted service. A free service's local filesystem is temporary. Secure
existing source records before any restart or storage cutover. See
[Render's free service limitations](https://render.com/docs/free) and the
[Blueprint reference](https://render.com/docs/blueprint-spec).

Keep manual-circle creation disabled on the public demo and apply the setting in
Render for any existing service. Remote storage disables manual creation by
default. Use `AJORA_MANUAL_SAVINGS_ENABLED=true` in access-controlled staging
for synthetic acceptance. Enable it for real users only in the isolated pilot
environment after the release gate. Existing records stay accessible.

To create a default demo login when it is missing,
set `AJORA_DEMO_EMAIL` and `AJORA_DEMO_PASSWORD` together in the Render service's
environment settings. Use a password of 15–128 characters; keep its value out of
Git. Startup creates the normal member account if it is missing and preserves an
existing matching account's ID and records. Conflicting credentials fail startup
without replacing an existing password. Leave both variables unset to disable
this bootstrap. The same variables can be set on the local API process.

With Turso active, matching demo accounts and their records survive API restarts.
In local SQLite mode, this bootstrap cannot restore previous circles after the
free host loses its temporary file. Other accounts are not seeded.

Run this SQLite service as a single instance. Set `AJORA_AUTH_ORIGINS` to an
exact origin such as `https://ajora-example.vercel.app`, with no path or trailing
slash. Separate additional origins with commas. You can add the Vercel domain
after creating the frontend project; authentication will reject that domain until
the API has the matching origin configured.

Check `https://YOUR-API-HOST/health` before connecting the frontend. Use the API
host's actual assigned URL; `YOUR-API-HOST` is a placeholder.

Keep the host health check on `/health` for process liveness. Monitor `/ready`
separately for savings-store connectivity. An HTTP 503 from `/ready` means the
store or schema could not be read. API logs include request IDs, route templates,
status and timing. Use the [pilot operations runbook](PILOT_OPERATIONS.md) to
assign alerts, verify proxy trust, and rehearse recovery before inviting members.

## 2. Connect Vercel to GitHub

Import [Mocdew/Ajora](https://github.com/Mocdew/Ajora) into Vercel, then configure:

| Setting | Value |
| --- | --- |
| Root Directory | `web` |
| Framework Preset | Next.js |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Production Branch | `main` |
| Production origin, available to Production and Preview builds | `AJORA_API_BASE=https://YOUR-API-HOST` |
| Preview environment variable | `AJORA_STAGING_API_BASE=https://YOUR-STAGING-API-HOST` |
| Public demo frontend setting | `NEXT_PUBLIC_AJORA_MANUAL_SAVINGS_ENABLED=false` |

`AJORA_API_BASE` is the production API's HTTPS root, without `/api/engine` or
another path. It stays server-side. Use the same production origin value in
Preview so the build can reject staging and production sharing an origin.
Next.js freezes rewrites at build time. Redeploy after changing the target.

Once Vercel assigns the frontend domain, add its exact HTTPS origin to the API's
`AJORA_AUTH_ORIGINS` and apply that environment change. Browser requests continue
using the frontend's `/api/engine/...` proxy; the API issues the existing HttpOnly
session cookie through that same origin.

See [Vercel's monorepo setup](https://vercel.com/docs/monorepos) for the root
directory setting.

### Google sign-in

Follow [Google sign-in setup](GOOGLE_SIGN_IN.md) to create a Google web client.
Set its client ID as `AJORA_GOOGLE_CLIENT_ID` on the API and
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` on Vercel before building. Register the exact
frontend HTTPS origin in Google's authorized JavaScript origins. This popup flow
uses no redirect URI or client secret. Password users connect Google from
**Account access** after signing in.

Google-linked accounts use the same savings store as password accounts. Configure
Turso on the API to retain them across redeployments on the free plan. For local
SQLite hosting instead, attach a persistent disk on a supported plan, set
`AJORA_STATE_DIR` inside its mount, and retain backups. A directory setting alone
does not attach storage. See [Durable savings on free hosting](TURSO_STORAGE.md)
and [Render's disk setup](https://render.com/docs/disks).

### Password reset and email verification

Follow [account email setup](ACCOUNT_EMAIL.md). Configure `AJORA_RESEND_API_KEY`,
`AJORA_EMAIL_FROM`, and `AJORA_PUBLIC_WEB_URL` on the API, then redeploy it with
the accompanying frontend pages. Email secrets stay server-side. Registration and
login continue working before delivery is configured; actual inbox delivery must
be checked with an approved sender before onboarding members.

## 3. Push updates

Commit reviewed changes and push or merge them to the configured production
branch. Vercel automatically builds and deploys the frontend; the Render API
configuration deploys after checks pass. The live version changes when the build
and deployment succeed. Saving a local file alone does not update production.
No additional GitHub Actions deployment job or deploy hook is needed for this
workflow. See [Vercel Git deployments](https://vercel.com/docs/git).

Other Git branches receive Vercel preview deployments. For previews that can
register users or change circle records, use a separate API and savings database
(or a separate state directory with both Turso variables and
`AJORA_REQUIRE_REMOTE_SAVINGS` unset for local SQLite),
and set Preview `AJORA_STAGING_API_BASE` accordingly. Preview builds require this
variable and do not fall back to the production target. Keep Vercel's system
environment variables exposed, including `VERCEL_ENV`, so the build detects
Preview. Match the frontend circle selector to the API policy in that environment.
Add only trusted, exact preview
origins to that API's allow-list; do not allow every `*.vercel.app` domain.

For synthetic staging rehearsals on a public API host, set both
`AJORA_STAGING_ACCESS_REQUIRED=true` and the server-only
`AJORA_STAGING_ACCESS_TOKEN` on the dedicated staging API. Generate a random
URL-safe token with at least 32 bytes of entropy, for example
`secrets.token_urlsafe(32)`. Only `GET` and `HEAD` on exact `/health` are available
without it. Keep Vercel Preview behind deployment protection. An authorised
test runner sends `X-Ajora-Staging-Access` only to that Preview's API path or
the exact staging API origin. Test refusal at the direct API and through the
Preview before starting the synthetic journey. Keep the token out of client
environment variables, traces, URLs, logs, and screenshots. Rotate or remove
it at the end of the rehearsal. Leave both settings unset outside synthetic
staging.

The `codex/ajora-p0-staging` Preview can relay the server credential for a
browser rehearsal behind Vercel Deployment Protection. Apply the same token
as `AJORA_STAGING_RELAY_TOKEN` in Vercel's Sensitive Preview settings for that
branch only. The relay pins API requests to the existing dedicated staging
origin and forwards Ajora's own session cookies. Verify that a signed-out
visitor is refused by Vercel and that the direct Render API still refuses
tokenless requests. Remove the Preview setting and redeploy after the rehearsal.

## Protected Cloudflare staging

The Cloudflare staging frontend runs Next.js through vinext on Workers Free.
Its same-origin `/api/engine` proxy uses the private Python Worker described
below. The frontend requires HTTP Basic authentication before serving pages,
static assets, or API routes. Ajora sign-in controls access to each synthetic
account and circle. The dedicated `ajora-p0-staging-api` service on Render Free
is the staging rollback target.

Use an active `workers.dev` subdomain. From the repository root, install
dependencies and build the staging frontend:

```sh
npm --prefix web ci
npm --prefix web run build:cloudflare
```

### Render staging rollback setup

On the dedicated Render staging API, keep `AJORA_STAGING_ACCESS_REQUIRED`,
`AJORA_REQUIRE_REMOTE_SAVINGS`, `AJORA_MANUAL_SAVINGS_ENABLED`, and
`AJORA_COOKIE_SECURE` set to `true`. Add the exact staging frontend HTTPS origin,
without a trailing slash, to `AJORA_AUTH_ORIGINS`. Use the classic libSQL
`ajora-p0-staging` URL for `TURSO_DATABASE_URL` and a valid database-scoped
read/write token for `TURSO_AUTH_TOKEN`.

Generate independent URL-safe secrets with at least 32 random bytes for the
Render API's `AJORA_STAGING_ACCESS_TOKEN` and the frontend's
`AJORA_STAGING_WEB_PASSWORD`. In a private JSON file outside the repository
with permissions `0600`, put the frontend password and save the Render access
token as `AJORA_STAGING_RELAY_TOKEN`. The Worker forwards that token only to the
dedicated Render origin. The browser uses the username `ajora-staging` and the
frontend password.

For a Render-backed staging build, omit `AJORA_API` from `services` in
`web/wrangler.jsonc`, rebuild the frontend, and deploy it with the private
Render relay secret file:

```sh
cd web
npx wrangler deploy --config dist/server/wrangler.json --secrets-file /private/path/web-secrets.json
```

Before entering synthetic accounts, check that anonymous requests to the staging
home page, a real static asset, and `/api/engine/health` all return `401`, and
that the direct Render `/ready` endpoint rejects unauthorised requests. Run the
two-user synthetic walkthrough in [pilot readiness](PILOT_READINESS.md#section-11-release-decision)
through the protected frontend. After the Render API restarts, sign in again
and compare the saved circle history and export from both accounts. Keep the
Turso token valid for the rehearsal, and remove the private local secret file
after deployment and verification.

### Private API on Cloudflare Workers Free

The Python Worker `ajora-staging-api-free` accepts requests through the
frontend's `AJORA_API` service binding. It exposes no public route or preview
URL. The SQLite-backed Durable Object runs FastAPI and password hashing within
the Durable Object CPU allowance. Savings, accounts, and sessions commit to the
isolated `ajora-p0-staging` Turso database. Keep the staging frontend behind
HTTP Basic authentication. Staging uses synthetic analytics and the
offline explainer. Its synthetic consent, audit, and correction files are
temporary. Leave Google sign-in, Resend, live bank data, and live model
credentials unset.

Use a database-scoped read/write token in `TURSO_AUTH_TOKEN` and a new
URL-safe `AJORA_STAGING_ACCESS_TOKEN` with at least 32 random bytes. Pass them to
the API deployment using a private JSON file with permissions `0600`. The
API configuration pins the staging database URL. Use the same relay value as
`AJORA_STAGING_RELAY_TOKEN` in a separate frontend secret file alongside
`AJORA_STAGING_WEB_PASSWORD`. Retain the Render relay secret securely for
rollback. Rotate an expiring Turso token before its expiry to keep the API ready.

From the repository root, use Python 3.13 or later and `uv` to prepare the API.
Wrangler comes from the frontend install above. Replace the secret file path
with the private API JSON file:

```sh
python3.13 deploy/cloudflare/free-api/prepare.py
cd deploy/cloudflare/free-api
../../../web/node_modules/.bin/wrangler deploy --dry-run
../../../web/node_modules/.bin/wrangler deploy --secrets-file /private/path/api-secrets.json
```

Build the frontend from the repository root as above. For an isolated rehearsal,
copy `web/dist/server/wrangler.json` within the same directory, set both `name` and
`topLevelName` to `ajora-staging-api-check`, and set `services` to
`[{"binding":"AJORA_API","service":"ajora-staging-api-free"}]`. Deploy the copy
with Wrangler and the candidate frontend secret file. The API allows the exact
HTTPS origins for the rehearsal Worker and the protected staging frontend.

Verify that unauthorised HTML, assets, and `/api/engine/ready` return `401`, then
check authenticated readiness and run the two-user synthetic savings walkthrough.
Repeat sign-in and compare both ledger exports after redeploying the API. Record
the frontend and backend Worker versions. Before switching `ajora-staging-web`,
record its current version and verify that the Render API is ready with a valid
Turso credential. Deploy the staging frontend with the `AJORA_API` binding and
the corresponding Worker relay secret.

To restore Render routing, run `npx wrangler rollback RENDER_VERSION_ID --config wrangler.jsonc`
from `web`, substituting the recorded version, and verify protected readiness
and sign-in. If redeploying from source, omit `AJORA_API` and use the active
Render relay secret as `AJORA_STAGING_RELAY_TOKEN`. Both backends use the same
isolated Turso database, so the frontend rollback needs no database restore.

## Cloudflare Workers Free production

The [public production Worker](https://ajora-production-web.anthonyerinfolami.workers.dev)
uses the private `ajora-production-api` service binding. Production uses the
existing `ajora-savings` Turso database and keeps creation
of new manual circles disabled. The API requires a production relay token and
validates browser writes against the exact production origin. It does not
expose a public hostname. Bank analytics uses the bundled synthetic fixtures
and the offline explainer. Its synthetic consent, audit, and correction files
are temporary.

Prepare the API as above. Deploy `--env production` with a private secret file
containing `TURSO_AUTH_TOKEN`, `AJORA_PRODUCTION_RELAY_TOKEN`,
`AJORA_RESEND_API_KEY`, and `AJORA_EMAIL_FROM`. The frontend uses only the same
`AJORA_PRODUCTION_RELAY_TOKEN`. Run these commands from the repository root:

```sh
uv run --no-project --python 3.13 python deploy/cloudflare/free-api/prepare.py
cd deploy/cloudflare/free-api
../../../web/node_modules/.bin/wrangler deploy --env production --secrets-file /private/path/api-secrets.json
cd ../../../web
AJORA_CLOUDFLARE_PRODUCTION=true npm run build:cloudflare
npx wrangler deploy --config dist/server/wrangler.json --secrets-file /private/path/web-secrets.json
```

Verify `/api/engine/health` and `/api/engine/ready` on the new frontend, then
verify that a preexisting account can sign in and access its saved records.
The production Turso credential expires on 12 February 2027 at 16:41
Africa/Lagos. Renew it on the private API before that date.

The previous hostname, `ajora-one.vercel.app`, is managed by Vercel. Its CDN
routing rules redirect page URLs to Cloudflare with `307` and return `503`
for legacy `/api/engine` calls. Existing sessions are tied to
the hostname that issued them. Users coming to the new hostname sign in again
using their existing credentials. Resend uses its existing sandbox sender.

The legacy `ajora-api` Render service is suspended. For a rollback, resume it
and confirm its `/health` returns `200`, then disable the two cutover routing
rules in the Vercel CDN settings and publish. Both hosts use the same Turso
database. The legacy API does not support every circle state written by the
current release. Check compatibility with the latest production records
before reopening legacy writes.

## Saved records and local development

Local development runs at `http://localhost:3200`. This port does not become the
Vercel deployment port; visitors use the assigned HTTPS domain.

SQLite files and runtime logs are excluded from Git. A newly provisioned API
starts with fresh account and circle state unless connected to an existing Turso
store. Pushing code does not upload local accounts, circles, or sessions, and
setting Turso variables does not import an existing SQLite file. Keep private
backups and complete the documented cutover before enabling writes to a new
store. Render Free's local SQLite and analytics logs can reset on restart or
deployment; Turso retains only the savings records committed to it.

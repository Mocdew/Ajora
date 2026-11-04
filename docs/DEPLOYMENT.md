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

## 2. Connect Vercel to GitHub

Import [Mocdew/Ajora](https://github.com/Mocdew/Ajora) into Vercel, then configure:

| Setting | Value |
| --- | --- |
| Root Directory | `web` |
| Framework Preset | Next.js |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Production Branch | `main` |
| Production environment variable | `AJORA_API_BASE=https://YOUR-API-HOST` |

`AJORA_API_BASE` is the API's HTTPS root, without `/api/engine` or another path.
It stays server-side. Set it before deployment because Next.js freezes rewrites at
build time; redeploy after changing it. The build validates this setting on
Vercel so a missing or local API address cannot silently reach production.

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
and set Preview `AJORA_API_BASE` accordingly. Add only trusted, exact preview
origins to that API's allow-list; do not allow every `*.vercel.app` domain.

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

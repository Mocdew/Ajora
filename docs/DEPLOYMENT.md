# Deploying Ajora

The free demo setup runs the Next.js frontend on Vercel and the FastAPI service
on Render's free plan. The API writes account credentials, sessions, and circle
records to temporary SQLite storage. **These accounts and circle records can
reset on restart or deployment.** No persistent disk is configured. Raw bank
transactions remain in memory. Vercel Functions cannot provide persistent local
SQLite storage, so the API runs separately.
See [Vercel's SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).

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
| Persistent disk | None |
| Secure session cookies | `AJORA_COOKIE_SECURE=true` |
| Allowed frontend origins | Set `AJORA_AUTH_ORIGINS` to the exact public frontend origin(s) |
| Automatic deployments | After the connected branch's checks pass |

The Blueprint creates a new free Docker service from this repository's `main`
branch. It does not change an existing Render demo service. A free service's
local filesystem is temporary, so use disposable demo accounts and circles. See
[Render's free service limitations](https://render.com/docs/free) and the
[Blueprint reference](https://render.com/docs/blueprint-spec).

To restore a default demo login automatically after every restart or redeployment,
set `AJORA_DEMO_EMAIL` and `AJORA_DEMO_PASSWORD` together in the Render service's
environment settings. Use a password of 15–128 characters; keep its value out of
Git. Startup creates the normal member account if it is missing and preserves an
existing matching account's ID and records. Conflicting credentials fail startup
without replacing an existing password. Leave both variables unset to disable
this bootstrap. The same variables can be set on the local API process.

This restores access to the demo account, **not its previous circles or records**
after the free host loses its temporary storage. Other accounts are not seeded.

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

## 3. Push updates

Commit reviewed changes and push or merge them to the configured production
branch. Vercel automatically builds and deploys the frontend; the Render API
configuration deploys after checks pass. The live version changes when the build
and deployment succeed. Saving a local file alone does not update production.
No additional GitHub Actions deployment job or deploy hook is needed for this
workflow. See [Vercel Git deployments](https://vercel.com/docs/git).

Other Git branches receive Vercel preview deployments. For previews that can
register users or change circle records, use a separate API and state directory,
and set Preview `AJORA_API_BASE` accordingly. Add only trusted, exact preview
origins to that API's allow-list; do not allow every `*.vercel.app` domain.

## Saved records and local development

Local development runs at `http://localhost:3200`. This port does not become the
Vercel deployment port; visitors use the assigned HTTPS domain.

SQLite files and runtime logs are excluded from Git. A newly provisioned API
starts with fresh account and circle state. Pushing code does not upload local
accounts, circles, or sessions. Keep local records and their backups locally;
the free hosted demo can lose its saved state on restart or deployment.

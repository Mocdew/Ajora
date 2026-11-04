# Set up Google sign-in

Google sign-in uses Ajora's existing SQLite accounts and 30-day HttpOnly session
cookies. Configure a Google web client and put its client ID in both services to
enable the button. Email/password access continues to work.

## 1. Create the Google web client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or
   select an Ajora project.
2. Open [Google Auth Platform → Branding](https://console.cloud.google.com/auth/branding).
   Enter **Ajora**, your user support email, and developer contact email. For
   production, provide your actual public homepage, privacy policy, and terms URL
   if you have terms. Complete domain ownership and branding verification when
   Google requires them; use real pages describing Ajora's use of Google account
   information. See [Google's branding requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).
3. In [Audience](https://console.cloud.google.com/auth/audience), choose
   **External** for an app used by the public. You can begin in **Testing** and
   publish when ready. Google exempts sign-in that requests only basic identity
   (`openid`, email, profile) from the testing user-list restriction and seven-day
   authorization expiry. Adding other scopes changes those rules. See
   [Google's audience guidance](https://support.google.com/cloud/answer/15549945).
4. In [Clients](https://console.cloud.google.com/auth/clients), choose
   **Create client → Web application**. Name it **Ajora web**.
5. Add **Authorized JavaScript origins** for the frontend you actually use:

   | Environment | Origin |
   | --- | --- |
   | Local development | `http://localhost` and `http://localhost:3200` |
   | Docker Compose, if used | `http://localhost:3000` |
   | Local IP address, if used | `http://127.0.0.1:3200` |
   | Production | Your exact frontend HTTPS origin, such as `https://your-ajora.vercel.app` |

   Use origins without a path. Register each actual hostname and port; an API
   address is not the frontend origin. The example production hostname must be
   replaced with your assigned hostname.
6. Leave **Authorized redirect URIs** empty. This implementation receives the
   result through the Google popup's JavaScript callback. Copy the **Client ID**,
   which ends in `.apps.googleusercontent.com`.

Ajora uses basic Google identity only. You do not need to enable Gmail or Drive
APIs, add their scopes, or configure a service account. This flow does not use a
client secret. Google's [web setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
explains web clients, origins, and optional redirect handling.

## 2. Configure local development

Replace `YOUR_CLIENT_ID.apps.googleusercontent.com` below with the copied client
ID. The client ID is public configuration; keep any Google-generated client
secret private and out of the frontend.

From the repository root, install the backend dependency and start the API:

```bash
.venv/bin/python -m pip install -r requirements.txt
export AJORA_GOOGLE_CLIENT_ID='YOUR_CLIENT_ID.apps.googleusercontent.com'
.venv/bin/python -m uvicorn api.main:app --reload
```

Add the same ID to `web/.env.local` without replacing its other settings:

```dotenv
NEXT_PUBLIC_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
```

Restart the frontend:

```bash
npm --prefix web run dev
```

Open [Ajora at localhost:3200](http://localhost:3200). The Google button appears
when the frontend ID is configured; the API accepts Google sign-in only when its
own ID is configured. Both IDs must match. `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is
embedded at build time, so production changes require a new frontend build.

## 3. Configure hosting and durable storage

Set these values in the hosting provider's environment settings:

| Service | Variable | Value |
| --- | --- | --- |
| API | `AJORA_GOOGLE_CLIENT_ID` | Your Google web client ID |
| API | `AJORA_AUTH_ORIGINS` | Exact public frontend origin; comma-separated for multiple trusted origins |
| API | `AJORA_COOKIE_SECURE` | `true` for production HTTPS |
| API | `TURSO_DATABASE_URL` | Approved hosted savings database URL; see [Turso setup](TURSO_STORAGE.md) |
| API | `TURSO_AUTH_TOKEN` | Private database-scoped read/write token; keep out of Git and frontend variables |
| API | `AJORA_REQUIRE_REMOTE_SAVINGS` | `true` in the Render Blueprint; reject missing remote settings |
| API | `AJORA_STATE_DIR` | Local analytics directory; also holds savings SQLite when both Turso variables and the remote requirement are unset |
| Frontend | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | The same Google web client ID, set before building |
| Frontend | `AJORA_API_BASE` | Existing API HTTPS origin, set before building |

Apply API environment changes and rebuild/redeploy the frontend. Add the frontend
HTTPS origin to the Google client's authorized origins too.

The included free Render service can retain savings in Turso managed SQLite when
both Turso variables are configured. Remote commit is required before success;
storage failures never fall back to a local file. The Blueprint sets
`AJORA_REQUIRE_REMOTE_SAVINGS=true` to reject missing remote settings. Leaving both
Turso variables and this guard unset selects local SQLite for development; do not
disable the guard on Render Free, where local SQLite can reset on restart or
deployment. Partial configuration fails clearly. Local analytics JSONL logs remain
temporary
on Render Free in either mode. Google cannot restore records lost from a local
SQLite file.

Follow [Turso setup](TURSO_STORAGE.md) to secure existing records, perform an
approved cutover, and verify persistence. Configuration changes do not migrate
data automatically; no live migration or storage cutover has been performed as
part of this repository update. Local SQLite hosting requires a durable volume
and backups; Docker Compose already provides a volume. See
[Render persistent disks](https://render.com/docs/disks) and
[Deploying Ajora](DEPLOYMENT.md).

## 4. Check account access

1. In a fresh browser, choose **Continue with Google**, complete Google's popup,
   and create a circle. Reload and confirm that you remain signed in.
2. Sign out, then use the same Google account in another browser. Confirm that
   the same circle and membership return.
3. For an existing email/password account, sign in with its password first, open
   **Account access**, and connect the matching Google account. Ajora does not
   automatically merge accounts because their emails match.
4. For a browser-only profile, connect Google while that profile is signed in to
   preserve its circles. The upgrade retires its old recovery key.

Automated tests use simulated Google responses. A live popup test requires your
configured Google client and a real Google account.

## How the session works

The frontend obtains a short-lived, single-use challenge from
`POST /auth/google/challenge`, passes its nonce to Google, then sends the returned
credential to `POST /auth/google`. The API verifies Google's signed token and
binds Google's permanent `sub` identifier to the Ajora user ID in SQLite. It issues
the existing session cookie and returns the session with `google_linked: true`.
Raw Google tokens are not stored. See
[Google's token verification guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

If the button is missing, check the frontend environment and restart/rebuild it.
If Google rejects the origin, compare the browser's exact scheme, hostname, and
port with the client's origin list. If an account already exists, sign in to that
account before connecting Google. Use the same hostname for the whole local flow
so its cookies remain available.

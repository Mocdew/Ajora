# Durable savings on free hosting

Ajora can keep Vercel and Render on their free plans while storing savings state
in Turso managed SQLite. Turso is the authoritative store: a successful savings
write must mean its remote transaction committed. A network or database failure
must fail the request, without switching to temporary local SQLite.

This covers account identities and credentials, sessions, Google account links,
circle membership and agreements, contribution records, receipt allocations,
and payout history. Raw bank transactions remain ephemeral. This change does
not make the API's separate local analytics JSONL logs durable.

## Configure the hosted API

The approved database is `ajora-savings`, using the classic libSQL/SQLite engine
in AWS US West (Oregon). Use the remote libSQL driver described in
[Turso's Python quickstart](https://docs.turso.tech/sdk/python/quickstart), rather
than a local file with periodic synchronization.

Set these values in the Render API service's environment settings:

| Variable | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | `libsql://ajora-savings-olumide.aws-us-west-2.turso.io` |
| `TURSO_AUTH_TOKEN` | A database-scoped read/write token for `ajora-savings` |
| `AJORA_REQUIRE_REMOTE_SAVINGS` | `true`, as set by the Render Blueprint |

Keep the token out of Git, application responses, screenshots, and logs. Do not
put it in Vercel or any `NEXT_PUBLIC_` variable. The browser continues using the
existing same-origin `/api/engine/...` proxy; only FastAPI connects to Turso.

With both Turso variables and `AJORA_REQUIRE_REMOTE_SAVINGS` unset, the API selects
the local SQLite development mode at `AJORA_STATE_DIR/savings.sqlite3`. The
Blueprint sets the remote requirement to `true`, so missing Turso configuration
fails instead of accepting savings writes to Render's temporary filesystem. Keep
the guard enabled and both Turso variables configured on Render. Partial or
invalid configuration must fail clearly. An unavailable configured remote store
must never trigger local fallback. For isolated local rehearsals or browser
tests, unset all three variables and use a fresh `AJORA_STATE_DIR`.

The existing `AJORA_DEMO_EMAIL` and `AJORA_DEMO_PASSWORD` settings can remain on
Render. Once Turso is active, startup creates the normal demo account only if it
is missing; matching accounts retain their IDs and records across API restarts.
There is no automatic account reset or special administrator permission.

Turso's free tier has storage and query-usage limits. Monitor usage and retain
backups; free hosting is not unlimited storage. Check the current
[Turso pricing and quotas](https://turso.tech/pricing) before increasing usage.

## Protect existing records before cutover

Creating the Turso database does not copy Render's current SQLite file. Render
Free can discard that file on restart, spin-down, or redeployment. Do not deploy
the storage change until the source records are secured and the cutover is
approved.

A complete migration needs a consistent SQLite backup taken while writes are
paused, preserving original user IDs, password hashes, Google links, sessions,
recovery keys, circle documents, receipts, and payout records together. Import
into the destination before enabling new writes, then compare row counts and
representative account and circle histories. Keep a private recovery copy.

Render Free does not provide the Shell/SSH access needed for a straightforward
complete file export. Existing authenticated circle reads can preserve records
visible to that account, but do not export every user's credentials, sessions,
or identities. Such JSON exports are not a complete database backup. A prior
private demo-account export contained zero visible circles; that does not prove
that other users had no records.

If a complete source backup is unavailable, stop for an explicit decision about
starting fresh and retaining any available partial exports. Do not claim that
existing records were migrated, silently discard them, or expose a public
database-export endpoint. Never commit a database backup to Git.

## Verify persistence

1. After the approved import or fresh initialization, log in and create a test
   circle. Complete the normal member, agreement, and start workflow, then submit
   a contribution. Record the user ID, circle ID, and contribution reference.
2. Restart and redeploy the Render API. Log in again without re-registering.
   Confirm that the same IDs, membership, contribution status, and payout history
   remain available through the Vercel site.
3. Exercise a storage failure in an isolated test environment. Confirm that a
   failed remote commit does not return success or create a fallback local
   savings database. Restore connectivity and verify the last committed state.

Only report the hosted persistence change as complete after these checks pass
against the configured remote database.

## Verified hosted run — 4 November 2026

**Hosted account and circle records survived an API redeployment.** The run used
[Ajora on Vercel](https://ajora-one.vercel.app) through its same-origin
`/api/engine` proxy, with application commit
`42dfefe67ecf53e86e0ae6174d7caa36af63832f` before and after deployment.

The Render service stayed on Free. Its existing Turso configuration remained
unchanged; `AJORA_REQUIRE_REMOTE_SAVINGS=true` was added to require remote storage.

| Evidence | Result |
| --- | --- |
| Baseline deployment | `dep-dbll420u01pc73ckbnt0` |
| [Redeployment](https://dashboard.render.com/web/srv-dblfkjugekts7389f6j0/deploys/dep-dbll996c6qcc73bimt50) | `dep-dbll996c6qcc73bimt50`, **Deploy succeeded / Live**, duration 43.5 seconds |
| New process startup | 16:52:39 Africa/Lagos; deployment live at 16:52:48 |
| Post-deployment verification completed | 16:53:33 Africa/Lagos |
| Synthetic circle | `55cca4ef008717eab5b01e74d1057026` |

Two new synthetic password accounts completed a two-member, two-round circle
before redeployment. Its record contained four contribution claims, six
instalments, two recipient-confirmed payouts, and 19 history events. After the
new deployment became live, both existing cookie sessions still returned the
same user IDs. Fresh `/auth/login` requests also restored those identities and
their circle access without registering again.

The complete circle response matched the saved baseline exactly, including
membership, agreements, contributions, payout history, and events. Its canonical
SHA-256 fingerprint was identical before and after redeployment:

```text
59ef866270cea7fc0581cae152d28a2cd41fdd656eb34917395c417fc7af3915
```

The synthetic records remain available as verification evidence. No real money
moved. This run does not establish migration of older temporary-storage records.
Google sign-in was excluded from this run and left unchanged.

Local storage, savings, identity, reconciliation, password-authentication, and
demo-account checks also returned **75 passed, 1 skipped, 1 deselected**. The
native-driver concurrency check was skipped because local `libsql` was absent;
the live Turso transaction test was deliberately deselected to keep that local
run offline. The hosted lifecycle and redeployment checks above ran separately.
Local failure checks exercised simulated connection and commit failures without
local fallback. No production storage outage was injected, so isolated remote
failure verification remains outstanding.

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

Set both values in the Render API service's environment settings:

| Variable | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | `libsql://ajora-savings-olumide.aws-us-west-2.turso.io` |
| `TURSO_AUTH_TOKEN` | A database-scoped read/write token for `ajora-savings` |

Keep the token out of Git, application responses, screenshots, and logs. Do not
put it in Vercel or any `NEXT_PUBLIC_` variable. The browser continues using the
existing same-origin `/api/engine/...` proxy; only FastAPI connects to Turso.

Both variables unset selects the local SQLite development mode at
`AJORA_STATE_DIR/savings.sqlite3`. Partial or invalid configuration must fail
clearly. Keep both variables configured on Render so the hosted API uses Turso.
An unavailable configured remote store must never trigger local fallback.

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

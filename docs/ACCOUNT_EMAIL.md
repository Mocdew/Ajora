# Password reset and email verification

Ajora's password accounts can confirm mailbox ownership and recover access with
single-use email links. Both flows keep the existing user ID, circle membership,
agreements, contributions and payout history. Google sign-in is unchanged.

## Configure delivery

The API sends transactional email using [Resend's HTTPS API](https://resend.com/docs/api-reference/emails/send-email).
Render Free blocks the usual SMTP ports, so this integration uses HTTPS instead.
See [Render's free service limits](https://render.com/docs/free).

1. Create or use a Resend account and [verify a sending domain you own](https://resend.com/docs/dashboard/domains/introduction).
   Add the DNS records Resend provides. Disable open and click tracking for these
   authentication emails so links remain direct and private.
2. Create a sending-only API key restricted to that domain.
3. Set these values on the **API**, never in frontend or `NEXT_PUBLIC_` variables:

   | Variable | Value |
   | --- | --- |
   | `AJORA_RESEND_API_KEY` | Private Resend sending key |
   | `AJORA_EMAIL_FROM` | Approved sender, for example `Ajora <accounts@your-domain.example>` |
   | `AJORA_PUBLIC_WEB_URL` | Exact frontend origin: `https://ajora-one.vercel.app` for the current deployment |

4. Restart or redeploy the API after setting the values. Deploy the accompanying
   frontend pages before sending real account links. No frontend email secret is
   needed. Leave the existing Turso and authentication-origin settings in place.

`AJORA_PUBLIC_WEB_URL` must be an HTTPS origin without credentials, a path, a
query, or a fragment. Local development also permits HTTP on `localhost` or
`127.0.0.1`, for example `http://localhost:3200`. Links always use this configured
origin, never a request's Host or forwarded headers.

Missing or invalid configuration disables email requests with a clear temporary
unavailability response; registration, login and existing circle access remain
available. Configuration readiness does not prove that Resend accepted the key
or that a message reached an inbox. Test actual delivery before wider onboarding.
Do not enable production delivery using placeholder credentials or a test-only
sender that cannot reach your members.

For local Docker Compose, export the three variables before starting Compose;
the default public web origin is `http://localhost:3000`. Keep real credentials
out of Git, shell history, screenshots and chat.

## Member experience

- **Verify email:** after signing in, use **Send verification email** in the email
  verification panel. Open the email and select **Verify email address**. The link
  expires after 24 hours. Requesting another link replaces the previous one.
- **Reset password:** choose **Log in → Forgot password?**, enter the account
  email and open the reset email. Set and confirm a password of 15–128 characters.
  The link expires after 30 minutes. After a successful reset, all previous
  sessions and recovery keys are revoked; log in with the new password. A
  separate email notifies the member that the password changed.

Verification is requested explicitly; registration does not automatically send
email. Existing accounts start unverified unless the mailbox was already
confirmed through an existing linked sign-in method. Verification does not lock
members out of their circles and does not establish bank or legal identity.
Password reset proves access to the same mailbox, so it also marks that address
verified. It never adds a password to an account that has no password credential.

Reset requests return the same acknowledgement for registered and unknown email
addresses. Delivery is attempted after that response and is not a durable mail
queue. If no email arrives, check spam and request a new link. An unavailable
provider must not expose whether an account exists. A failed password-change
notification does not undo the committed reset.

## Storage and link handling

Additive SQLite tables store verified mailbox state and SHA-256 hashes of random,
purpose-bound tokens. Tokens also bind to the current password credential, so
changing a password invalidates older links. Raw link tokens are sent only in the
email and the subsequent JSON confirmation request; they are not stored in the
database or returned by the API.

Email URLs use `/reset-password#token=...` or `/verify-email#token=...`. Fragments
do not reach the web server. The page reads and removes the fragment after
loading, sends no referrer, and consumes the token only on an explicit form
submission. Refreshing after the fragment has been removed requires reopening
the email. A GET request or an email link scanner does not verify an address or
change a password.

Hosted state uses the same authoritative Turso connection and commit rules as
circle records. Local state uses `AJORA_STATE_DIR/savings.sqlite3`. No separate
database service, raw bank history, or persisted outbound email body is added.

## API

| Method and path | Input | Result |
| --- | --- | --- |
| `POST /auth/password/forgot` | `{email}` | Generic `202 {message}` |
| `POST /auth/password/reset` | `{token, password}` | `200 {message}`; sessions revoked, no automatic login |
| `GET /auth/email/status` | Authenticated session | `{email, verified, delivery_available}`; `email` is null without a password credential |
| `POST /auth/email/request` | Authenticated session, `{}` | `202 {message}` |
| `POST /auth/email/verify` | `{token}` | `200 {message}`; no automatic login |

Account email mutations are rate limited; responses use `Cache-Control: no-store`. Mutations retain the
existing JSON and allowed-origin checks. Invalid, expired, reused or superseded
links return a generic error without echoing the token or password.

## Acceptance checks

1. Create a test password account and circle. Request and confirm verification;
   confirm the verified status after signing in from another browser.
2. Request a reset. Open the link in another browser, choose a new password and
   confirm that older sessions and the old password no longer work. Log in with
   the new password and confirm the same user and circle records return.
3. Confirm that reused, expired, superseded and wrong-purpose links fail, and
   that a link visit alone makes no account change.
4. Restart the API between requesting and consuming a link to verify durable
   token storage. Use an isolated environment for delivery or storage failures.

Automated checks use a fake email transport and temporary account storage; they
must never send email to real members. Real sender setup and inbox delivery are
separate deployment acceptance checks.

### Local delivery verification — 4 November 2026

The implementation passed 267 Python tests (two environment-dependent checks
skipped), the production build, lint, and TypeScript. All 22 browser checks passed
across the full run and a targeted rerun after correcting a test selector. The
browser run included the real API with a private test mailbox, preserving the
same account and circle after verification and password reset.

An additional approved local run used the actual Resend sending-only key and
`Ajora <onboarding@resend.dev>`. Resend reported the verification, reset, and
password-change notification emails as delivered to the account owner's address.
Both token confirmations succeeded; the old password and session were rejected,
and a new login restored the same identity and circle. All records belonged to
isolated local test storage; no hosted member's password was changed.

The sender configuration was saved in Render using **Save only**. The feature
remains committed locally, without a GitHub push or production deployment, as
requested. The initial sender supports restricted testing to the Resend account
owner. Verify an owned sending domain and replace `AJORA_EMAIL_FROM` before
enabling delivery for other members.

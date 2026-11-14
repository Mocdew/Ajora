# Ajora remaining implementation and ownership plan

**Planning baseline: 4 November 2026, Africa/Lagos.** Repository baseline: `ff3d4bf`. This plan covers product, engineering, operations, trust, and commercial work needed to move the existing savings-circle MVP into a credible pilot and then a sustainable public product. Ownership uses roles and the engineering agents defined in [AGENTS.md](../AGENTS.md).

Ajora already supports the main savings-circle journey. Its next viability milestone should be a small, invited pilot for existing groups that know one another, make payments through their own bank accounts, and use Ajora as their shared record. The remaining critical work is making that record safe to rely on, handling exceptions, restoring access and records, operating support, and proving that organisers continue using the product.

Live bank reconciliation, payment execution, and live AI each introduce additional commitments. They have separate readiness gates below. They are not prerequisites for testing whether manual savings-circle recordkeeping solves a valuable problem.

## 1 What viable means

Ajora is ready for an invited pilot when all five conditions hold:

1. **Useful:** a real organiser can set up an agreed circle, invite members, review externally made contributions, and complete a recipient-confirmed payout with understandable records.
2. **Trustworthy:** permissions, payment sources, amounts, disputes, agreement changes, and uncertain writes have clear behaviour. Synthetic receipts cannot fund a real circle in the application.
3. **Recoverable:** members can regain access, retained records survive deployments, and the operator can restore a verified backup after a failure.
4. **Operable:** a person owns reminders, complaints, access problems, incidents, service costs, and release decisions. Users can reach that person through a published channel.
5. **Ready to learn:** the team has a bounded pilot budget, baseline measures, and agreed success/stop thresholds. Repeat use, saved organiser effort, member understanding, and sustainable costs are evaluated during and after the pilot before expansion.

Passing automated tests establishes part of engineering readiness. It does not establish real customer demand, legal readiness, inbox delivery to members, operational recovery, or sustainable economics.

### Priority definitions

| Priority | Meaning |
| --- | --- |
| **P0** | Required before the invited real-use pilot. A documented, staffed manual procedure may satisfy an item when explicitly allowed below. |
| **P1** | Required before open public onboarding or growth beyond what the pilot team can safely support. Bring an item forward if pilot evidence makes it essential. |
| **P2** | Required only if Ajora launches the corresponding live-bank, analytics, AI, or paid-product promise. |
| **P3** | An improvement to consider after repeat use and a measurable need. |

“Partial” means a mechanism exists but needs a specific extension, operating process, or deployment check. “Operational verification” means the remaining task is evidence from the configured environment rather than rebuilding existing code. Proposed targets in this plan are release criteria to adopt or revise before the pilot; they are not measured results.

## 2 What is already implemented

The existing product is a working MVP, rather than an empty scaffold. Keep this work and extend it where the backlog identifies a gap.

| Capability | Existing implementation and limits | Source |
| --- | --- | --- |
| Circle setup and membership | Weekly/monthly schedules, integer-kobo contributions, member limits, invitation preview, joining, and payout-order management. | [Savings API](../api/savings.py), [circle setup](../web/components/savings/circles.tsx) |
| Agreed terms | Versioned acceptance, agreement snapshots, and a requirement for a full circle and unanimous current acceptance before starting. Membership/order/collection changes invalidate earlier acceptance. | [Savings API](../api/savings.py), [circle detail](../web/components/savings/circle-detail.tsx) |
| Contribution accounting | Instalments, submitted/confirmed/rejected states, confirmed totals, reasons, and correction history. Savings money uses integer kobo already. | [Savings API](../api/savings.py), [reconciliation tests](../api/tests/test_savings_reconciliation.py) |
| Receipt reconciliation | Exact demo reference-and-amount matching, organiser approval, and receipt allocation that prevents the same receipt funding two payments. The feed is simulated. | [Feed provider](../api/savings_feed.py), [savings API](../api/savings.py) |
| Payout turns | The organiser reports an external payout as sent; only the recipient can confirm receipt and advance the current round. Payout problems can be reported. | [Savings API](../api/savings.py), [circle detail](../web/components/savings/circle-detail.tsx) |
| Shared record | Historic rounds, agreement snapshots, payment decisions, payout acknowledgements, and application events. Payment dispute flags currently add history without automatically blocking payouts. | [Circle detail](../web/components/savings/circle-detail.tsx), [activity](../web/components/savings/activity.tsx) |
| Account access | Email/password, password hashing, HttpOnly sessions, sign-out, legacy profile upgrades and recovery, and configured Google account linking. | [Authentication](../api/auth.py), [Google authentication](../api/google_auth.py), [account UI](../web/components/savings/shared.tsx) |
| Email recovery and verification | Reset and verification code, hashed single-use tokens, expiries, session revocation after reset, frontend pages, and a Resend transport exist. Actual local delivery was verified to the sender-account owner. Wider hosted delivery remains a release task. | [Account email evidence](ACCOUNT_EMAIL.md), [email API](../api/account_email.py) |
| Durable savings | Local SQLite and authoritative Turso managed SQLite, remote commit before success, and no silent local fallback. A documented hosted two-account, two-round lifecycle survived a Render redeployment on 4 November 2026 with identical records. | [Storage](../api/savings_storage.py), [hosted verification](TURSO_STORAGE.md#verified-hosted-run--4-november-2026) |
| Refresh and sharing | Ten-second polling, manual refresh, and prepared WhatsApp invitations, reminders, and summaries. A person must send the WhatsApp message. | [Savings client](../web/lib/api/savings.ts), [circle detail](../web/components/savings/circle-detail.tsx) |
| Supporting analytics | Transfer deduplication, confidence tiers, correction verdicts, communal classification, graph, consent filtering, access logs, and grounded offline explanations. These operate on persona fixtures in the current product. | [Engine](../engine), [service](../api/service.py), [explanations](../api/explanations.py) |
| Automated checks | Python tests, evaluation reports, frontend lint/build, and Chromium browser journeys run in CI with isolated test state. Some evaluation commands need stricter failure gating. | [CI](../.github/workflows/demo.yml), [browser tests](../web/tests) |

The persistence result does **not** prove that older temporary-host records were migrated, that a backup can be restored, that live Google login was exercised in that run, or that an actual remote outage was tested. The local account-email result used a restricted test sender; it does **not** establish delivery to arbitrary members. Preserve these distinctions when reporting readiness.

## 3 Who is in charge

### Human accountability

Every work item below has one accountable role. That role owns the outcome, dependencies, and completion evidence. Supporting roles can implement parts of it. The product lead must assign an actual person to each role before the pilot; one person may hold several roles in a small team.

| Role | Accountable for | Primary engineering agent route |
| --- | --- | --- |
| **Product lead** | Target user, scope, rulebook, priorities, pilot limits, success thresholds, pricing decisions, and final release readiness. | `engineering-software-architect` for structural decisions; `engineering-codebase-onboarding-engineer` for mapping existing behaviour. |
| **Backend lead** | API contracts, savings invariants, permissions, account lifecycle, storage semantics, reconciliation, and safe administrative actions. | `engineering-backend-architect`; `engineering-minimal-change-engineer` for small bounded changes. |
| **Frontend lead** | React/Next.js journeys, status clarity, forms, mobile usability, accessibility, and recovery from errors. | `engineering-frontend-developer`. |
| **Platform operator** | Hosting, environment separation, secrets, backups, restores, monitoring, incident response, releases, capacity, and quotas. | `engineering-backend-architect` with `engineering-git-workflow-master` for release workflow. |
| **QA and release lead** | Acceptance scenarios, permission/concurrency/failure tests, browser/device checks, release evidence, and defect triage. | `engineering-code-reviewer`, supported by the implementation agent for the affected area. |
| **Security and privacy lead** | Threat assessment, access review, sensitive-data handling, incident safeguards, and implementation of approved privacy requirements. | `engineering-backend-architect` and independent `engineering-code-reviewer`. |
| **Trust and support lead** | Member help, complaints, dispute triage, reminder operations, case ownership, and communication during failures. | `engineering-technical-writer` for procedures; backend/frontend agents for support tooling. |
| **Legal adviser** | Nigerian legal/regulatory assessment, privacy and product terms, retention and transfer requirements, vendor agreements, and applicability of licensing/registration duties. | Qualified human adviser; engineering agents implement the resulting requirements. |
| **Growth and research lead** | Recruiting appropriate circles, observed usability, customer interviews, retention evidence, channel experiments, and willingness to pay. | Human-led research; `engineering-rapid-prototyper` only for bounded experiments and `engineering-technical-writer` for materials. |
| **Finance and commercial lead** | Operating budget, vendor accounts/contracts, cost per circle, revenue tests, billing records, and runway. | Human-owned decisions; backend/frontend agents implement approved billing features. |
| **Integrations lead** | Mono/provider onboarding, bank-account ownership, consent, token lifecycle, transaction normalization, and provider failure behaviour. | `engineering-backend-architect`, supported by `engineering-ai-engineer`. |
| **ML and AI lead** | Analytics accuracy, representative evaluation, scoring, FX/numeric policy, safe explanations, and model cost/quality gates. | `engineering-ai-engineer`, `engineering-ai-data-remediation-engineer`, and `engineering-prompt-engineer`. |

Agents are implementation and review routes, not substitutes for an accountable person, provider-account ownership, customer support, or legal sign-off. The named agent definitions are referenced by the repository; their `~/.Tensor/agents/` directory was unavailable in this workspace. Use the corresponding role instructions when available, or delegate with that role explicitly stated.

### Work that must stay with a human operator

The product or platform owner must control the organisation's domain/DNS, Vercel, Render, Turso, Resend, Google Cloud, and any future Mono account. They must arrange access, approve commercial terms and spending, supply secrets through the appropriate secret settings, and decide who can operate production. Engineering agents can prepare and verify configuration using authorised access; they cannot supply an owned domain, make customer commitments, conduct support conversations, or determine legal compliance merely by writing code.

## 4 Product decisions and pilot preparation

### G01 Define the first release and its limits

**P0 · Partial product definition · Accountable: Product lead · Agent: `engineering-software-architect` · Depends on: none.**

Write a one-page pilot brief naming the initial segment, operator, supported group size, allowed contribution range, cadence, and maximum number of concurrent circles. Prefer existing trusted groups and a small manual-payment pilot. Set explicit limits based on support and recovery capacity, rather than treating the API's 50-member or amount limits as a product-risk approval.

**Done when:** the team and participating organisers understand that payments occur externally, confirmations are recorded assertions, Ajora does not guarantee payouts or recover money, and unsupported situations have a published route to support. Marketing, onboarding, and the actual enabled features match this scope.

### G02 Validate the organiser problem with intended users

**P0 · Human research required · Accountable: Growth and research lead · Agent support: `engineering-technical-writer` · Depends on: G01.**

Observe existing organisers doing their current reconciliation work. Capture where WhatsApp, notebooks, and spreadsheets fail; how members recognise transfers; how missed contributions are handled; and whether members will maintain another app. A useful initial research target is 5–10 organisers across several real groups. Obtain permission before collecting identifiable financial material.

**Done when:** there are concrete workflow observations, an agreed first segment, baseline organiser time/error measures, pilot volunteers, and a ranked list of problems. Feature requests alone do not establish that people will switch or pay.

### G03 Publish the savings rulebook

**P0 · Partial rules in code, operating policy missing · Accountable: Product lead · Agents: `engineering-software-architect`, `engineering-technical-writer` · Depends on: G01 and G02.**

Define late/missed contributions, fees and overpayments, grace periods, reference collisions, member withdrawal/default, organiser absence, incorrect confirmations, contested receipts, mistaken payout references, bank reversals, and who bears external transfer costs. Decide whether due dates are reminders or restrictions on early payout. Decide how an organiser's own contribution is checked; current organiser confirmation is a trust-based action, not independent bank proof.

**Done when:** each scenario has an allowed action, authorised actor, record to retain, and escalation route. Unsupported changes are explicitly prevented or handled by a safe, documented process. Do not invent automatic fines, credit scores, guarantees, or debt recovery without a separate product and legal decision.

### G04 Establish legal and privacy readiness

**P0 · Assessment and user-facing policies required · Accountable: Legal adviser · Supporting: Product lead, Security and privacy lead · Agent: `engineering-technical-writer` for approved wording; backend/frontend agents for implementation · Depends on: G01 and G03.**

Have qualified Nigerian counsel assess the actual manual-tracking model and proposed claims. Cover the operating entity, product terms, complaint/redress process, lawful processing, member visibility, retention, account closure, cross-border vendors, incident reporting, and any applicable NDPC registration, audit, DPO, or impact-assessment obligations. Include overseas savings hosting and any future AI processing in the data map. Assess the applicable NDP Act and GAID requirements using current official materials, including the [NDPC guidance portal](https://ndpc.gov.ng/) and [NDPC FAQs](https://ndpc.gov.ng/faqs/).

Publish accessible privacy, terms, and support pages; show relevant notices before registration and agreement acceptance. Record policy versions/acceptance where required by the approved approach. Make the visibility of references, names, contribution status, and dispute reasons to other circle members explicit.

**Done when:** counsel's applicability decisions and required actions are recorded, the necessary actions are completed, and policies match actual implementation. Before live bank data or payment capabilities, assess the additional participant, consent, security, retention, and complaints requirements in the [CBN Operational Guidelines for Open Banking in Nigeria](https://www.cbn.gov.ng/Out/2023/CCD/Operational%20Guidelines%20for%20Open%20Banking%20in%20Nigeria.pdf). Do not infer that a no-custody product is exempt from every obligation, or that buying an aggregator API establishes compliance. Resolve any applicable retention requirements against the no-persisted-raw-bank-data architecture before integration; do not quietly change that architecture.

### G05 Define product measurement and pilot success

**P0 · Missing product operating measures · Accountable: Product lead · Supporting: Growth and research lead · Agents: `engineering-frontend-developer`, `engineering-backend-architect` · Depends on: G01 and G04.**

Define the funnel from circle creation through invitation, joining, final agreement acceptance, first confirmed contribution, recipient-confirmed payout, completed cycle, and next cycle. Measure pending-review age, overdue contributions, payout-confirmation delay, support workload, and organiser effort. These product metrics are separate from the existing financial analytics.

**Done when:** events have documented definitions and privacy limits, a minimal report can be produced, and the team has agreed go/iterate/stop thresholds before recruiting the pilot. Collect identifiers and operational counts sufficient for learning; avoid copying financial narrations, account details, or sensitive dispute text into general analytics.

## 5 Savings workflow and ledger work

### S01 Separate demonstration from real manual tracking

**P0 · Partial · Accountable: Backend lead · Supporting: Frontend lead, Product lead · Agents: `engineering-backend-architect`, `engineering-frontend-developer` · Depends on: G01.**

The current UI clearly labels simulation, but any circle can configure a demo collection account and simulated confirmations contribute to its totals. Introduce an enforceable deployment or circle mode so real pilot circles cannot use demo receipt approval. Keep demo records and their summaries clearly distinguishable in sharing, history, and exports. Existing records need an explicit compatibility rule.

**Done when:** server-side tests prove synthetic receipts cannot satisfy funding requirements for a real circle, direct API calls cannot bypass the restriction, and demo labels survive every relevant summary/export. Evidence: [collection account UI](../web/components/savings/circle-detail.tsx), lines 236–274; [feed types](../api/savings_feed.py), lines 28–60.

### S02 Make real external payment instructions usable

**P0 · Partial · Accountable: Product lead · Supporting: Backend lead, Frontend lead · Agents: `engineering-backend-architect`, `engineering-frontend-developer` · Depends on: G03 and S01.**

Provide the agreed payee/channel, contribution amount, required reference, and how the organiser checks receipt. A constrained pilot may place these instructions in the accepted rules and confirm them during onboarding. If structured account instructions are added, restrict visibility to the appropriate members, identify the organiser-provided source, and apply the agreed change/reacceptance rules. Determine how recipients privately give the organiser payout instructions.

Manual confirmations currently have no global receipt allocation: duplicate reference checks operate within one circle, while the shared receipt-allocation table is populated by feed matching. If the same organiser/account serves multiple circles, require a pilot reconciliation procedure that checks one external receipt is not credited to several obligations. Add an appropriate shared evidence/allocation control before automating that guarantee; a typed reference alone is not independent receipt identity. Evidence: [submission and matching](../api/savings.py), lines 471–472 and 700–705.

**Done when:** a member can identify exactly where and how to pay without guessing, the organiser can review the real external evidence, and changing payment instructions cannot silently redirect funds. No payment execution feature is needed to complete this item.

### S03 Add the essential lifecycle and agreement controls

**P0 for safe pilot restrictions and invite-abuse handling; P1 for broader self-service · Missing transitions · Accountable: Backend lead · Supporting: Product lead, Frontend lead · Agents: `engineering-backend-architect`, `engineering-frontend-developer` · Depends on: G03.**

Current states are draft, active, and completed. Define how to repair a draft, cancel an unstarted circle, remove an accidental draft member, and invalidate/rotate a leaked invite. For a bounded pilot, a draft with no payment records may be abandoned and recreated under an explicit support procedure instead of requiring every edit/removal control immediately. That procedure must make clear which draft should be used and how unwanted joining is prevented. Decide how draft amount/date/rules edits invalidate acceptance when editing is implemented. Specify active-circle pause, organiser replacement, member departure/replacement, rescheduling, and closing a stalled circle before exposing those controls.

**Done when:** every supported transition has permission and invariant tests, prior agreements/history remain readable, and members see what changed and whether fresh acceptance is required. A pilot may forbid active membership/order changes and use a staffed escalation process; it must not rely on ad hoc production database edits. Rich self-service transitions can follow proven need.

### S04 Turn discrepancy flags into an operating dispute process

**P0 · Partial · Accountable: Trust and support lead · Supporting: Product lead, Backend lead, Frontend lead · Agents: `engineering-backend-architect`, `engineering-frontend-developer`, `engineering-technical-writer` · Depends on: G03 and G04.**

Payment flags currently append an event without changing confirmation or blocking payout. Payout disputes do hold the current turn until the recipient later confirms receipt. Define which complaints require review before payout, who can pause/resume, what evidence is appropriate, and how resolution is acknowledged. Preserve both the initial assertion and correction. Treat disputed past payouts and later bank reversals explicitly; do not rewrite history to make the ledger look balanced.

**Done when:** users see a persistent unresolved state or an equally clear pilot case reference, each case has a human owner and response target, escalation is reachable, and any promised payout hold is enforced server-side. Tests cover a flag and payout action racing. A payment flag must never be described as a freeze while the backend still permits payout. Evidence: [dispute and receipt routes](../api/savings.py), lines 740–801.

### S05 Verify retries, stale actions, and concurrent writes

**P0 · Existing safeguards need broader failure acceptance · Accountable: Backend lead · Supporting: Frontend lead, QA and release lead · Agents: `engineering-backend-architect`, `engineering-code-reviewer` · Depends on: S01 and S04.**

Retain integer-kobo arithmetic, transactional writes, membership checks, current-round checks, feed receipt-allocation uniqueness, and recipient-only advancement. Test double taps, two organiser tabs, simultaneous instalments, stale agreement versions, repeated references, circle creation, and a lost response after a remote commit. Reference uniqueness already prevents some duplicates; it is not a complete protocol for every uncertain mutation. Circle creation currently generates a fresh ID on each request, so its lost-response retry needs an explicit outcome-recovery or deduplication rule.

**Done when:** retrying the same operation cannot create two circles, claims, starts, payouts, or round advances; the client can discover the committed result; contradictory actions return a meaningful conflict. Add operation identifiers or version preconditions where the current invariants do not establish the outcome. Test both local SQLite and the supported remote driver. Do not promise a failed request means “nothing happened” when commit acknowledgement was lost.

### S06 Provide a portable savings record

**P0 for a safe support-assisted export; P1 for self-service · Missing savings export · Accountable: Trust and support lead · Supporting: Backend lead, Frontend lead · Agents: `engineering-backend-architect`, `engineering-frontend-developer` · Depends on: G04 and S01.**

Export the circle's agreements, order, contributions/instalments, sources, decisions/reasons, payouts, acknowledgements, timestamps, and corrections in a readable statement and machine-readable format. Clearly separate simulated evidence. The existing analytics audit download is not a savings ledger export. An account's visible circle export is also not a complete database backup.

**Done when:** authorised members can obtain an understandable record, totals agree with the UI, unauthorised users cannot obtain it, and spreadsheet exports safely handle user-supplied text. The pilot support procedure can produce an export without sharing credentials or other circles' data. Self-service access should follow before public growth.

## 6 Identity access and member privacy

### I01 Release recovery email for real members

**P0 · Implemented locally; hosted release and general delivery outstanding · Accountable: Platform operator · Supporting: Backend lead, Frontend lead · Agents: `engineering-backend-architect`, `engineering-frontend-developer` · Depends on: G04.**

Verify an owned sending domain in Resend, replace the restricted test sender, configure the public origin, and release the already-built API and frontend flows together. Keep keys server-side. Exercise verification, password reset, expiry, reuse, resending, provider failure, and reset notification using approved test mailboxes on the hosted application. Verify that existing sessions are revoked and the same user/circle returns after reset.

**Done when:** members beyond the provider-account owner receive usable messages, a documented no-email/support fallback exists, and sender/links deliver correctly across devices. Decide whether verified contact details are a pilot participation rule; email verification currently does not block circle access. Existing delivery evidence and rollout limits are in [ACCOUNT_EMAIL.md](ACCOUNT_EMAIL.md), lines 118–137. Do not rebuild the implemented token/reset system.

### I02 Verify Google access if offered in the pilot

**P0 if offered; otherwise P1 · Operational verification · Accountable: Platform operator · Supporting: Backend lead, QA and release lead · Agents: `engineering-backend-architect`, `engineering-frontend-developer` · Depends on: G04.**

Confirm the Google Cloud audience/branding/origins and matching API/frontend client IDs. Test the actual popup, a new Google account, linking from an existing password account, a legacy-profile upgrade where supported, cross-browser return, and persistence through a deployment. Existing browser tests use simulated Google responses, and the documented storage redeploy run excluded Google.

**Done when:** Google restores the original identity and circle, matching emails do not silently merge identities, and wrong-origin/expired/challenge-replay attempts fail. If this cannot be supported yet, offer the proven password route and disable or clearly withhold the unverified option. Follow [GOOGLE_SIGN_IN.md](GOOGLE_SIGN_IN.md).

### I03 Add safe account maintenance

**P1 · Partial · Accountable: Backend lead · Supporting: Security and privacy lead, Frontend lead · Agents: `engineering-backend-architect`, `engineering-frontend-developer` · Depends on: I01 and G04.**

Prioritise authenticated password change, reauthentication for sensitive actions, and revoke-other-sessions. Define verified email change, display-name changes, Google unlinking without stranding access, and support for an inaccessible mailbox. A session inventory and stronger authentication for privileged operators can follow the threat assessment.

**Done when:** sensitive account changes prove control of the existing account, cannot transfer circle ownership through an unverified address, leave an appropriate security record, and have tested recovery/revocation behaviour. The pilot must already have an operator-run route for compromised access; a public account settings interface is the later deliverable.

### I04 Verify abuse controls through the deployed proxy

**P0 · Partial · Accountable: Security and privacy lead · Supporting: Backend lead, Platform operator · Agents: `engineering-backend-architect`, `engineering-code-reviewer` · Depends on: G01.**

Existing authentication has rate limits, origin/JSON checks, hashed credentials/tokens, and secure-cookie configuration. Verify their behaviour through Vercel and Render, including trusted client-address handling; current limits use `request.client.host`, which may represent a proxy. Do not blindly trust arbitrary forwarded headers. Cover registration, login, guest profiles, recovery, invitation guessing, and high-volume circle/payment creation. Define account/resource limits and handling for an abused invite.

**Done when:** abusive traffic is bounded without locking all members behind a shared proxy into one limit, cross-site mutations fail, private responses are not cached, and logs/errors expose no passwords, cookies, reset tokens, keys, or sensitive payment content. The direct API must enforce the same permissions as the UI.

### I05 Establish account closure and data requests

**P0 for a staffed process; P1 for self-service · Missing operating process · Accountable: Security and privacy lead · Supporting: Legal adviser, Trust and support lead, Backend lead · Agents: `engineering-backend-architect`, `engineering-technical-writer` · Depends on: G04 and S06.**

Define access/export, correction, account deactivation, and deletion requests. Authenticate the requester and distinguish personal account data from evidence shared with other members. Establish retention and anonymisation rules, including backups and any approved legal holds, before implementing destructive deletion.

**Done when:** a real request can be received, tracked, fulfilled or explained under the approved policy, and account closure neither destroys other members' ledger evidence nor leaves unwanted active access. Publish the contact and expected process; automate the interface before volume exceeds support capacity.

## 7 Reliability security and release operations

### O01 Implement backups and prove restoration

**P0 · Recovery operations outstanding · Accountable: Platform operator · Supporting: Backend lead · Agents: `engineering-backend-architect`, `engineering-technical-writer` · Depends on: G01 and G04.**

Choose a supported, consistent backup method for the authoritative savings store. Assign scheduling, encryption, private storage, access, retention, failure alerts, and restoration ownership. Agree the maximum acceptable record loss and restoration time; for an initial pilot, discuss a daily backup and a same-day restore target, then tighten or change them according to actual contributions and risk. Verify provider capabilities and costs before committing to a promise.

**Done when:** a backup has actually been restored to an isolated environment and checked for account links/credentials, memberships, agreements, instalments, receipt allocations, payouts, and event history. Record measured recovery time and the restored point. A surviving redeployment is useful durability evidence but does not replace a restore drill. See [TURSO_STORAGE.md](TURSO_STORAGE.md).

### O02 Complete a remote failure and credential-rotation drill

**P0 · Operational verification outstanding · Accountable: Backend lead · Supporting: Platform operator, QA and release lead · Agents: `engineering-backend-architect`, `engineering-code-reviewer` · Depends on: O01 and S05.**

Use a separate remote test database to exercise lost connectivity, timeouts, invalid/expired credentials, interrupted commit acknowledgement, and recovery. Keep the hosted remote-required guard enabled. Test credential rotation without losing committed savings state. Preserve the existing no-fallback rule.

**Done when:** unknown/failed writes are not shown as confirmed, no temporary local savings store is created as fallback, reconnecting exposes the last committed outcome, and retry cannot duplicate money records. Do not inject an outage into members' production records. Simulated local failures already exist; the real isolated remote drill remains outstanding in [TURSO_STORAGE.md](TURSO_STORAGE.md), lines 127–134.

### O03 Add readiness monitoring and incident ownership

**P0 · Missing operating controls · Accountable: Platform operator · Supporting: Backend lead, Trust and support lead · Agents: `engineering-backend-architect`, `engineering-technical-writer` · Depends on: G01.**

Keep liveness separate from a safe storage-readiness check. Monitor API reachability, savings read/write errors and latency, mail failures, database quotas, backup success, and cold-start behaviour. Use correlation IDs and redacted structured errors. Publish the support/incident contact, internal escalation, incident log, and member-communication procedure. Avoid revealing persona IDs or dependency secrets in public health responses.

**Done when:** a test failure generates an alert to the assigned operator, the operator can diagnose and follow a runbook, and members see useful outage/freshness messaging. Current [health](../api/main.py), lines 107–110, is liveness plus a persona roster; it is not proof the savings store is ready.

### O04 Separate environments and make releases reversible

**P0 · Deployment configuration exists; operating safeguards need verification · Accountable: Platform operator · Supporting: QA and release lead · Agents: `engineering-git-workflow-master`, `engineering-backend-architect` · Depends on: O01.**

Use separate staging and production APIs, databases, mail settings, and secrets. Ensure preview branches cannot alter production circles. Require relevant CI checks and independent review for meaningful changes. Record release commit, configuration changes, schema compatibility, smoke checks, rollback instructions, and backup status. Keep single-instance operation until the supported concurrency model is verified.

**Done when:** a preview changes only staging records, a prior app release can be restored against retained state, and an incompatible schema change has a tested recovery/forward-fix plan. Pushing code is not a migration. Preserve the remote-required setting and exact origin allow-lists described in [DEPLOYMENT.md](DEPLOYMENT.md).

### O05 Establish capacity and service-cost limits

**P0 for pilot capacity/budget; P1 for growth optimisation · Measurement required · Accountable: Platform operator · Supporting: Finance and commercial lead, Backend lead, Frontend lead · Agents: `engineering-backend-architect`, `engineering-frontend-developer` · Depends on: G01 and G05.**

Measure the agreed pilot workload and worst supported history size, including concurrent updates, polling, password hashing, remote latency, and free-host cold starts. Complete circle documents are currently read and updated, and activity/history aggregation is largely client-side. Calculate request volume from ten-second polling before accepting hosting/DB quotas.

**Done when:** the team has measured latency/error results, a supported pilot capacity, quota alerts, an upgrade trigger, and a current cost sheet. Bring list summaries, pagination, indexed access, history filtering, polling backoff, and query optimisation forward only where measurements justify them. Retain all old evidence when changing history navigation.

### O06 Complete an independent security release review

**P0 for pilot threat/access review; P1 for broader hardening · Partial · Accountable: Security and privacy lead · Supporting: Backend lead, Platform operator, QA and release lead · Agent: `engineering-code-reviewer` independent of the implementer · Depends on: S01, S04, S05, I04, and A01.**

Review cross-member/cross-circle access, organiser-only actions, recipient acknowledgement, identity upgrade/linking, injection and XSS paths, export escaping, secret handling, origin/cookie/cache behaviour, abuse, and dependency exposure. Verify appropriate browser security headers against the actual Google and app behaviour. Lock or constrain backend dependencies for reproducibility, scan dependencies/images, and assess a non-root API container runtime. These are hardening tasks, not claims that a specific installed package is vulnerable.

**Done when:** critical/high findings are resolved before pilot use, residual risks have explicit owners, a patch/credential-rotation process exists, and public launch has the wider dependency/container review. Record the reviewed commit and scope.

### O07 Resolve legacy records and migrations explicitly

**P0 if older hosted users or records exist · Historical-state decision outstanding · Accountable: Product lead · Supporting: Platform operator, Backend lead, Trust and support lead · Agents: `engineering-backend-architect`, `engineering-git-workflow-master` · Depends on: O01.**

Determine whether earlier temporary-host records need preservation. The documented redeploy test proves current synthetic records survived; it does not establish migration from older temporary storage. A visible-circle JSON export cannot recover every user's credential/session/link tables. Inventory supported schema changes and record a safe migration procedure for future releases.

**Done when:** known existing records are preserved and reconciled, or the accountable owner makes an explicit fresh-start decision with an appropriate user communication/partial-export process. Do not claim an old-state migration without evidence or expose a public full-database export. Apply the cutover safeguards in [TURSO_STORAGE.md](TURSO_STORAGE.md), lines 50–88.

## 8 User experience notifications and support

### U01 Verify the complete journey on real devices and assistive tools

**P0 · Responsive UI and some coverage exist; full acceptance required · Accountable: QA and release lead · Supporting: Frontend lead · Agents: `engineering-frontend-developer`, `engineering-code-reviewer` · Depends on: essential savings and identity changes.**

Run create/join/accept/contribute/review/dispute/payout/recover journeys on representative Android Chrome and iOS Safari devices, narrow 320–390px screens, keyboard navigation, screen readers, zoom, and reduced motion. Include large amounts, long names/reasons, long histories, pending/error states, and modal focus. Existing appearance/mobile-menu checks are a useful starting point.

**Done when:** no essential action is obscured or inaccessible, statuses/errors are understandable without colour alone, dates use the agreed Nigeria schedule, and material usability problems are resolved. Expand browser projects and retain evidence for manual checks; the current [Playwright configuration](../web/playwright.config.ts) does not define a browser/device matrix.

### U02 Make poor-network and expired-session behaviour dependable

**P0 · Partial · Accountable: Frontend lead · Supporting: Backend lead, QA and release lead · Agents: `engineering-frontend-developer`, `engineering-backend-architect` · Depends on: S05 and O03.**

Add bounded request/cancellation behaviour and useful freshness indicators where needed. Exercise offline transitions, a suspended tab, Render cold starts, response loss, interrupted forms, multiple tabs, session expiry, and two users editing the same circle. Preserve safe input and route the user back to the intended circle after reauthentication.

**Done when:** the UI distinguishes a request that was not sent from an outcome being checked and a committed result, re-fetches before unsafe retries, and cannot show stale sensitive records after an account switch. No unverified local optimistic state may present a contribution/payout as durably confirmed. Full offline ledger writing is a separate optional feature.

### N01 Assign reminders and implement automation only when needed

**P0 for a staffed reminder process; P1 for automation when manual coverage cannot meet scale or service promises · Partial · Accountable: Trust and support lead · Supporting: Product lead, Backend lead, Frontend lead · Agents: `engineering-technical-writer`, `engineering-backend-architect`, `engineering-frontend-developer` · Depends on: G03 and G04.**

Use existing prepared WhatsApp actions for a small pilot, with explicit organiser responsibilities and a schedule for due dates, pending reviews, and payout receipt reminders. In-app polling does not notify someone who is away. Determine the preferred channel with users before selecting email, SMS, WhatsApp Business, push, or a notification inbox.

**Done when:** pilot members know who sends reminders and how to report a missed one. Before relying on automatic delivery, implement event triggers, user contact/preferences, consent where applicable, scheduling in Africa/Lagos, duplicate suppression, cancellation after state changes, retries, delivery/failure visibility, and appropriate message privacy. Prepared WhatsApp text must not be marketed as an automatically delivered message.

### N02 Make outbound delivery durable before depending on it at scale

**P1 · Missing durable mail queue · Accountable: Backend lead · Supporting: Platform operator · Agent: `engineering-backend-architect` · Depends on: I01 and N01.**

Current password-reset email delivery runs after the acknowledgement and is not a durable queue. Evaluate a small permitted SQLite outbox or an approved file/object-backed mechanism when lost/retried delivery becomes an operational risk. Preserve the architecture: do not introduce another database service. Design token expiry, supersession, retry, and sensitive-payload handling together; any transient secret payload must be encrypted/access-limited and promptly removed under the approved privacy policy.

**Done when:** process restarts do not silently lose required delivery, retries do not spam users or resurrect invalid links, provider acceptance is distinguished from inbox delivery, and operators can see failures without seeing raw tokens. A staffed pilot may retain request-again behaviour if tested and honestly explained.

### C01 Operate member support and controlled administration

**P0 for support operation; P1 for richer tooling · Missing operating process · Accountable: Trust and support lead · Supporting: Backend lead, Security and privacy lead · Agents: `engineering-technical-writer`, `engineering-backend-architect`, `engineering-frontend-developer` · Depends on: G03, G04, I05, and S04.**

Publish a reachable help channel and operator hours. Define cases for lost access, incorrect records, non-responsive organiser/recipient, suspicious invitations, disputed payment, and service outages. Use case IDs, assigned owners, authenticated requests, response targets, and escalation. Give support a safe way to inspect permitted diagnostic information; do not use shared passwords, silent impersonation, or unrestricted database editing.

**Done when:** a rehearsal complaint reaches the owner, receives a useful response, and leaves an accountable resolution record. For the pilot, a private case log and bounded support-assisted actions are sufficient. Before growth, add role-limited tools, privileged-action logs, redaction, and stronger operator authentication. Support must never confirm a bank receipt merely to clear a backlog.

### C02 Run and evaluate an actual pilot

**P0 viability gate after engineering readiness · Not yet established by the demo · Accountable: Product lead · Supporting: Growth and research lead, Trust and support lead, QA and release lead · Agent support: `engineering-technical-writer` · Depends on: the pilot gates in section 11.**

Recruit a small set of existing circles and onboard organisers and members with agreed limits. A useful starting proposal is 3–5 circles. Observe initial setup, agreement acceptance, actual external payment recording, reviews, discrepancies, and recipient acknowledgement. Continue long enough to see repeat use; completing a monthly cycle takes months and cannot be replaced by a two-account synthetic walkthrough.

**Done when:** the team can compare organiser effort with the baseline, report activation/repeat use/record discrepancies/support costs, and explain why users returned or stopped. Evaluate at least real contribution rounds and a recipient-confirmed payout before expansion; full-cycle retention and renewed circles provide stronger later evidence. Use G05's pre-agreed thresholds to decide whether to expand, revise, or stop.

### C03 Prove operating economics and a plausible business model

**P0 for pilot budget and runway; P1 for repeatable commercial evidence · Missing operating model · Accountable: Finance and commercial lead · Supporting: Product lead, Growth and research lead, Platform operator · Agent support: `engineering-technical-writer` · Depends on: G02, G05, and O05.**

Maintain a current budget covering hosting, database, domain, email, backups, monitoring, support labour, legal work, and any optional bank/AI calls. Use measured request volumes and current provider terms; no free tier should be assumed unlimited or permanent. Interview and test whether the payer is an organiser, group, cooperative, employer, or another customer. Compare against their existing tools.

**Done when:** the team knows cost per active circle, support effort, runway, pricing hypotheses, and an affordable service level. Public growth needs evidence of willingness to pay or a deliberate funded alternative. Do not assume a payment commission is available when Ajora does not move the money.

### C04 Add billing and growth features only after the offer is validated

**P2 for a paid launch; P3 for speculative expansion · Conditional · Accountable: Finance and commercial lead · Supporting: Product lead, Backend lead, Frontend lead · Agents: `engineering-backend-architect`, `engineering-frontend-developer` · Depends on: C02 and C03.**

If charging for software, implement plan entitlements, payment-provider verification, reliable subscription state, receipts, failed renewal/grace behaviour, cancellation, refunds, and support. Subscription collection is distinct from collecting circle contributions. Choose a distribution channel and measure acquisition-to-activated-circle conversion before adding referral rewards or broad campaigns.

**Done when:** the agreed customer can understand and purchase the offer, billing events are idempotent and reconciled, cancellations/refunds follow approved terms, and usage/cost/retention support continued operation. Repeat-circle templates, co-organisers, additional languages, PWA/installability, and richer evidence capture should follow observed demand rather than precede the pilot.

## 9 Conditional bank analytics and AI work

### A01 Protect the public analytics boundary now

**P0 for an explicit synthetic-only deployment boundary; P2 for real-account analytics · Missing identity binding · Accountable: Security and privacy lead · Supporting: Backend lead · Agents: `engineering-backend-architect`, `engineering-code-reviewer` · Depends on: G01.**

The `/users` analytics routes currently accept path user IDs without savings identity/ownership dependencies, including reads, consent changes, audit, and corrections. The provider can load `data/private` or `AJORA_PERSONA_PATH`; `/health` lists provider IDs. This is suitable only for an explicitly public synthetic demo. The Docker context already excludes `data/private`; preserve that safeguard and enforce the allowed dataset at runtime too.

**Done for the pilot when:** public analytics exposes only a reviewed synthetic allow-list or is disabled, private fixture loading cannot accidentally expose a person's data, and public demo state cannot be confused with savings membership. **Done before private/live analytics when:** signed-in identity determines account access, unauthenticated requests fail, A cannot read/mutate B's transactions/consent/corrections/audit, and arbitrary provider rosters are not exposed. Evidence: [routes](../api/routes.py), lines 36–100 and later handlers; [provider loading](../api/providers.py), lines 70–84.

### A02 Make analytics consent and event records suitable for real use

**P2 before private/live-bank analytics · Demo mechanisms only · Accountable: Integrations lead · Supporting: Security and privacy lead, Platform operator · Agent: `engineering-backend-architect` · Depends on: G04 and A01.**

Current consent is seeded as granted for fixture accounts, and filtering occurs after fetching a batch. Real consent must be affirmative, scoped, versioned, time-bound, and obtained before authorised provider access. Revocation must stop future fetches and revoke provider-side authorisation where supported. Store encrypted consent credentials only in the approved secrets/object-storage approach; define rotation and deletion.

Move append-only analytics consent, audit, and correction files out of Render's temporary filesystem into approved durable file/object storage before treating them as real records. Turso currently makes savings durable, not these files. Define replay, corruption/truncated-line handling, write concurrency, export, retention, and integrity guarantees. Plain append-only JSONL is not cryptographic tamper evidence; narrow the claim or implement verifiable integrity if required.

**Done when:** revocation prevents provider fetches, consent survives redeployment, access events and latest verdicts can be replayed/restored, and the user-facing guarantees match the actual store. No raw bank transaction history is persisted. Evidence: [consent](../api/consent.py), [dependency paths](../api/deps.py), [audit implementation](../api/audit.py), lines 69–95.

### A03 Implement the live Mono provider and account-link journey

**P2 if bank connectivity is part of the launch promise · Missing integration · Accountable: Integrations lead · Supporting: Product lead for commercial access, Frontend lead, ML and AI lead · Agents: `engineering-backend-architect`, `engineering-frontend-developer`, `engineering-ai-engineer` · Depends on: G04, A01, and A02.**

Complete provider commercial/sandbox onboarding and verify current official contracts/API documentation. Implement server-side account linking and user ownership, encrypted token lifecycle, transaction normalization, pagination, stable IDs, freshness, time/currency semantics, provider limits, retries, disconnect/reconnect, and revoked/expired access. Add honest UI for consent, connection status, stale feeds, and provider unavailability. Maintain the schema-matched mock mode.

**Done when:** an authorised sandbox account completes link → fetch → normalize → dedup/classify → revoke, two-user isolation holds, credentials never reach the browser/logs, and failures are tested. Advance to live accounts only after the separate provider/privacy/security readiness decision. `FilePersonaProvider` and `DemoBankFeedProvider` are seams, not a completed live integration.

### A04 Connect real receipt evidence to savings safely

**P2 if real bank reconciliation is promised · Missing real-feed states · Accountable: Backend lead · Supporting: Integrations lead, Frontend lead · Agents: `engineering-backend-architect`, `engineering-frontend-developer` · Depends on: S01, S02, S04, S05, and A03.**

Extend demo-only feed/source types, consented collection-account selection, provenance, stable provider receipt IDs, timestamps, and freshness states. Reconcile confirmed server-fetched receipts while handling ambiguous/truncated references, duplicate feeds, delayed credits, reversals, and competing claims. Preserve one-receipt-one-allocation across circles using the same external account. Bank evidence and organiser manual confirmation must remain distinguishable.

**Done when:** the browser cannot manufacture “verified” transactions, ambiguous matches require review, allocation remains correct under concurrent approval/retry, and a revoked/unavailable feed cannot silently produce fresh verification. Keep raw feeds in memory and retain only the approved minimum savings evidence. Do not auto-confirm payouts simply because a debit appears; recipient receipt remains a separate assertion unless the product rules explicitly change.

### A05 Establish representative accuracy evidence and enforce CI thresholds

**P1 for strict existing CI reports; P2 for real-data accuracy claims · Partial · Accountable: ML and AI lead · Supporting: QA and release lead · Agents: `engineering-ai-engineer`, `engineering-ai-data-remediation-engineer`, `engineering-code-reviewer` · Depends on: G04; real-data evaluation also depends on A01 and authorised data access.**

Invoke the existing dedup and communal harnesses with `--strict`, or implement explicitly approved regression thresholds. Their current CI invocations print reports but omit strict mode; the harness entry points otherwise exit successfully even when their computed result reports regressions. Existing pytest accuracy checks still provide some coverage.

Before making live accuracy claims, build a consented or appropriately de-identified representative held-out dataset with independent labels. Include same-name/amount hard negatives, narration variation, delays, duplicate provider rows, fees, reversals, FX, and informal-finance ambiguity. Report precision/recall by bank, confidence tier, and class, plus failures and correction rates. Keep the existing evaluation-label leakage tests.

**Done when:** a deliberately regressed matcher/classifier fails its intended CI gate and versioned evaluation reports describe the actual dataset and limitations. Historical perfect fixture scores are not market accuracy. Train a learned scorer only if it improves held-out results over the existing rule-based baseline. Evidence: [workflow](../.github/workflows/demo.yml), lines 13–14; [dedup harness](../engine/harness.py), lines 150–169; [communal harness](../engine/communal_harness.py), lines 146–157.

### A06 Define exact analytics arithmetic and dated FX behaviour

**P2 before real monetary/FX analytics · Known trade-offs · Accountable: ML and AI lead · Supporting: Backend lead · Agents: `engineering-ai-engineer`, `engineering-backend-architect` · Depends on: A03 and the intended currency scope.**

Savings is already exact integer-kobo accounting. Analytics deliberately uses a float-backed transaction model, and some FX paths use demo rates. The relationship graph also falls back to 1.0 for an unknown conversion. Define rounding, rate source/date, unavailable/stale rates, fees, and reconciliation invariants before real cross-currency use. Reject unavailable conversions rather than silently implying parity.

**Done when:** totals and graph values reconcile on adversarial money/FX cases and explain their rate provenance. If exact analytics arithmetic is required, migrate schema, engine, API, UI, fixtures, and evaluations together; do not reintroduce a competing orphan money model. Evidence: [transaction decision](transaction-model-decision.md), lines 9–36; [graph conversion](../engine/communal/graph.py), lines 25–35.

### A07 Resolve the explainer provider and live-AI release gate

**P2 only if live AI is offered · Architecture mismatch and conditional validation · Accountable: Product lead · Responsible for technical implementation: ML and AI lead · Agents: `engineering-software-architect`, `engineering-ai-engineer`, `engineering-prompt-engineer` · Depends on: G04, A01, and A05.**

[AGENTS.md](../AGENTS.md) specifies Tensor while the optional live implementation uses Anthropic; the hosted configuration is offline. Choose the intended provider and either implement the approved Tensor adapter or explicitly update the governing decision. Verify current provider/model identifiers when implementing. Offline grounded explanations remain a valid pilot default.

Before sending real facts to a model, minimise/redact names and counterparties, agree provider processing/retention, and evaluate semantic correctness as well as number membership. Test swapped income/spending meaning, wrong relationship assertions, units/signs, uncertainty, prompt injection, refusal, timeout, and fallback. Keep the rule that models explain computed facts and never supply the arithmetic. Add cost/rate/concurrency limits and live-quality monitoring.

**Done when:** the provider choice is consistent with architecture, data-sharing requirements are met, live semantic/grounding evaluations pass an approved gate, and an unavailable/unsafe response produces the deterministic fallback. Adding an API key alone does not satisfy this item. Evidence: [live client](../engine/explainer/client.py), [grounding](../engine/explainer/grounding.py), [facts](../engine/explainer/facts.py), [explanation service](../api/explanations.py).

### A08 Introduce model training only when feedback justifies it

**P3 · Conditional improvement · Accountable: ML and AI lead · Agents: `engineering-ai-engineer`, `engineering-ai-data-remediation-engineer` · Depends on: A02 and A05.**

The scorer has a trainable seam, while the normal path is rule-based. Define label quality, permitted reuse of correction feedback, dataset/version provenance, offline training, evaluation, model rollout, and rollback before using feedback to change scores. Do not add fine-tuning, retrieval, or autonomous optimisation simply because related agent roles exist.

**Done when:** a proposed model improves the agreed held-out safety/accuracy measures, privacy requirements are met, and regression monitoring/rollback are demonstrated. Otherwise keep the simpler scorer.

## 10 Implementation order and dependencies

The sequence below gives parallel tracks without pretending that a delivery date can be fixed before staffing, provider access, and legal/research work are known.

| Stage | Work to complete | Accountable coordinator | Exit evidence |
| --- | --- | --- | --- |
| **1 Scope and operating decisions** | G01–G05; define supported lifecycle exceptions and pilot manual procedures. | Product lead | Pilot brief, user observations, rulebook, legal/privacy actions, measurement thresholds, assigned humans. |
| **2 Engineering and operational pilot gates in parallel** | S01–S06; I01, conditional I02, I04–I05; O01–O07 as applicable; U01–U02; N01; C01; A01. | QA and release lead coordinates owners | Real/manual journey, permissions/retry checks, general recovery delivery, usable support/export, backup restore, isolated remote failure, monitoring alert, release rollback, device acceptance. |
| **3 Invited pilot and business learning** | C02; C03 pilot budget and economics; collect G05 measures and triage defects. | Product lead | Real repeat use and payout records, user feedback, support effort, adoption/retention decisions, affordable next-stage budget. |
| **4 Public onboarding readiness** | Remaining P1 lifecycle/account/export/support automation; N02 as needed; capacity/history improvements; stricter release gates; commercial offer validation. | Product lead with QA and release lead | Repeatable onboarding/recovery/support, measured capacity, no unresolved critical defects, responsible public claims, credible operating model. |
| **5 Optional bank or AI expansion** | A02–A07 and conditional C04, separately scoped. | Integrations lead for bank work; ML and AI lead for analytics/AI | Provider/legal/security checks, consent/ownership, durable event evidence, live-feed/reversal cases, representative accuracy, approved AI data handling. |

For a lean team, assign one person as product/research/support/commercial coordinator, one as backend/platform/security owner, and one as frontend/QA owner. Independent review can come from another team member or the reviewer agent, but the production operator remains a human. If there are only two people, combine frontend/QA with product work and limit pilot size accordingly. Do not start the optional bank/AI track merely to keep every role busy.

### First ten actions

1. Product lead assigns named humans to the roles and adopts the manual-pilot scope and limits under G01.
2. Growth and research lead recruits organisers for observed workflow research under G02.
3. Product lead and support lead settle exception, dispute, reminder, and payment-instruction policies under G03, S02, S04, and N01.
4. Backend/frontend leads enforce demo-versus-real separation and the synthetic-only analytics boundary under S01 and A01.
5. Legal/privacy owner supplies applicable policy requirements; frontend publishes the approved entry points under G04.
6. Platform operator completes the owned email sender and hosted recovery acceptance under I01.
7. Platform/backend owners perform the backup restore and isolated remote failure/retry drills under O01, O02, and S05.
8. Platform/support owners establish alerts, incident handling, staging isolation, rollback, help contact, and export handling under O03, O04, C01, and S06.
9. QA/frontend leads run the realistic manual-contribution, mobile/accessibility, poor-network, and permission acceptance matrix under U01, U02, and O06.
10. Product lead opens the bounded pilot only after section 11's pilot gate is satisfied; measure use, organiser effort, costs, and repeat participation before expanding.

## 11 Release gates and proof of completion

### Invited pilot gate

- [ ] One accountable human is assigned to product, engineering/platform, QA, support, privacy/legal coordination, and service costs.
- [ ] Pilot scope, group/amount limits, product claims, payment instructions, and rules are explicit.
- [ ] A real manual circle cannot use simulated receipts; public analytics is demonstrably synthetic-only or disabled.
- [ ] Two distinct users complete invite, agreement, instalment review, payout report, recipient receipt, and history retrieval on the hosted app.
- [ ] Wrong-role and cross-circle actions fail; duplicate/stale/lost-response/concurrent actions preserve the ledger.
- [ ] A real member can recover access through a generally usable email sender or an explicitly supported tested access method.
- [ ] Disputes and unsupported lifecycle events have an enforced behaviour, a published contact, and a staffed case owner.
- [ ] Required legal/privacy actions and public notices for the actual pilot scope are complete.
- [ ] A private backup has been restored and checked in an isolated environment.
- [ ] An isolated remote-storage failure/credential drill proves no false success, no local fallback, and safe reconciliation/retry.
- [ ] Staging/preview isolation, deploy smoke checks, rollback, dependency readiness, and alerts have been exercised.
- [ ] Members can obtain a permission-safe savings export; support and reminders have an actual assigned operator and cadence.
- [ ] Full manual-circle journeys pass essential mobile, accessibility, slow-network, and expired-session acceptance.
- [ ] Security release review has no unresolved critical/high findings in the pilot scope.
- [ ] Success/stop thresholds, pilot budget/runway, and feedback collection are set before recruitment expands.

### Public onboarding gate

- [ ] Pilot evidence supports continued use and a clear target segment; material usability/trust failures are resolved.
- [ ] Support/recovery/account-maintenance/export/lifecycle handling can meet expected volume without informal database edits.
- [ ] Tested capacity, quota/cost alerts, patching, backups/restores, incident response, and release ownership cover the expected workload.
- [ ] Appropriate policy, commercial, and privacy requirements remain satisfied as scale and scope change.
- [ ] Pricing/funding and service promises are consistent with measured operating costs.
- [ ] Product and marketing describe actual verification, automation, protections, and data retention accurately.

### Conditional bank and AI gate

- [ ] Provider contracts/access, applicable legal requirements, and architectural retention decisions are resolved.
- [ ] Real identity/account ownership, explicit consent before fetch, revocation, encrypted token handling, and durable event records are tested.
- [ ] Provider outages, stale feeds, ambiguity, duplicate receipts, concurrent allocation, and reversals have safe behaviour.
- [ ] Accuracy claims use representative held-out evidence; CI fails on approved regression thresholds.
- [ ] FX/arithmetic policies and any live-AI provider/data-sharing/semantic safety gates are satisfied.

### Completion evidence required for each work item

Record the accountable person's name, implementation/release reference, environment, acceptance result, date, and any remaining bounded limitation. Use a row with `ID | accountable person | status | target | evidence | blocker | next action` in the team's tracker. “Code merged”, “environment variable saved”, “provider accepted an email”, and “a test file exists” each describe only part of completion.

The checks recorded in this repository are historical evidence at their stated commits/environments. This planning review inspected source and documented verification; it did not rerun the full test suites or verify live infrastructure settings. Run the relevant release checks against the version actually being shipped, then attach the results to the work item.

## 12 Architecture constraints that continue to apply

- Keep Next.js/React/TypeScript on the frontend and FastAPI/Pydantic on the backend. Route frontend work to the React/Next.js agent rather than Laravel defaults.
- Keep savings persistence in local SQLite or the approved Turso managed SQLite service. Do not add Postgres or another database service without first changing the architectural decision.
- Acknowledge hosted savings writes only after remote commit. An unavailable remote store must never silently become a temporary local savings file.
- Keep raw bank transactions ephemeral. Preserve only approved minimum savings evidence; keep consent secrets encrypted in the approved secrets/file/object-storage approach.
- Keep analytics audit/correction events append-only in permitted durable files/object storage when real use requires durability. Savings persistence alone does not make these logs durable.
- Keep financial calculations deterministic and testable. Models explain facts and never calculate balances or authorise payouts.
- Preserve agreement history, contribution decisions, receipt allocation, and recipient acknowledgement when adding convenience or administration features.

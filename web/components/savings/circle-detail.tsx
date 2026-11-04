"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUp, ArrowDown } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import {
  useBankFeed,
  useCircle,
  useSavingsAction,
  type Circle,
  type SavingsSession,
} from "@/lib/api/savings";
import {
  ErrorNotice,
  Loading,
  SavingsGate,
  TrackingNote,
  dateLabel,
  inputClass,
  localToday,
  money,
} from "./shared";

type Payment = NonNullable<Circle["contributions"][number]["payments"]>[number];

function ShareButton({ label, text }: { label: string; text: () => string }) {
  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={() =>
        window.open(
          `https://wa.me/?text=${encodeURIComponent(text())}`,
          "_blank",
          "noopener,noreferrer",
        )
      }
    >
      {label}
    </button>
  );
}

function Detail({ session, id }: { session: SavingsSession; id: string }) {
  const result = useCircle(session.user_id, id);
  const action = useSavingsAction();
  const owner = result.data?.organizer_id === session.user_id;
  const feed = useBankFeed(
    session.user_id,
    id,
    Boolean(
      owner &&
      result.data?.status === "active" &&
      result.data?.collection_account,
    ),
  );
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [accountLabel, setAccountLabel] = useState("Demo collection account");
  const [payoutReference, setPayoutReference] = useState("");
  const [viewRound, setViewRound] = useState<number | null>(null);
  const [reasonTarget, setReasonTarget] = useState<{
    path: string;
    title: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  if (result.isPending) return <Loading />;
  if (result.error || !result.data)
    return <ErrorNotice error={result.error} retry={() => result.refetch()} />;
  const circle = result.data;
  const members = [...circle.members].sort((a, b) => a.position - b.position);
  const current = circle.current_round;
  const shownRound = viewRound ?? current;
  const currentContributions = circle.contributions.filter(
    (c) => c.round_number === current,
  );
  const mine = currentContributions.find(
    (c) => c.member_id === session.user_id,
  );
  const claimed = (mine?.payments ?? [])
    .filter((p) => p.status !== "rejected")
    .reduce((sum, p) => sum + p.amount_kobo, 0);
  const remainingClaim = Math.max(0, circle.contribution_kobo - claimed);
  const confirmed = currentContributions.reduce(
    (sum, c) => sum + c.confirmed_kobo,
    0,
  );
  const matched = currentContributions.reduce(
    (sum, c) => sum + c.matched_kobo,
    0,
  );
  const target = circle.contribution_kobo * circle.member_limit;
  const recipient = members.find((m) => m.position === current);
  const payout = circle.payouts.find((p) => p.round_number === current);
  const myAcceptance = (circle.acceptances ?? []).some(
    (a) =>
      a.member_id === session.user_id && a.version === circle.agreement_version,
  );
  const acceptedCount = (circle.acceptances ?? []).filter(
    (a) => a.version === circle.agreement_version,
  ).length;
  const due = circle.due_dates[current - 1];
  const write = async (path: string, body: unknown = {}) => {
    try {
      await action.mutateAsync({ path: `/circles/${id}${path}`, body });
      return true;
    } catch {
      return false;
    }
  };
  const askReason = (path: string, title: string) => {
    setReasonTarget({ path, title });
    setReason("");
  };
  const move = (index: number, offset: number) => {
    const ordered = members.map((m) => m.user_id);
    [ordered[index], ordered[index + offset]] = [
      ordered[index + offset],
      ordered[index],
    ];
    void write("/order", { member_ids: ordered });
  };
  const memberName = (memberId: string) =>
    members.find((m) => m.user_id === memberId)?.display_name ?? "Member";
  const payoutLabel = (status: string) =>
    ({
      sent: "Sent · awaiting recipient",
      received: "Recipient confirmed received",
      disputed: "Recipient reported a problem",
      legacy_recorded: "Historical record · receipt unconfirmed",
    })[status] ?? status;

  return (
    <>
      <Link href="/circles" className="link-accent mb-5">
        <ArrowLeft className="h-4 w-4" />
        My circles
      </Link>
      <PageHeader
        eyebrow={
          circle.status === "draft"
            ? "Gathering your people"
            : circle.status === "active"
              ? `Round ${current} of ${circle.member_limit}`
              : "Circle completed"
        }
        title={circle.name}
        description={`${money(circle.contribution_kobo)} per member · ${circle.frequency} · ${members.length}/${circle.member_limit} members`}
        actions={
          <span className="badge-neutral">
            {owner ? "Organiser" : "Member"} · {circle.status}
          </span>
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          Last updated{" "}
          {result.dataUpdatedAt
            ? new Date(result.dataUpdatedAt).toLocaleTimeString("en-NG", {
                timeZone: "Africa/Lagos",
              })
            : "just now"}{" "}
          · updates every 10 seconds
        </span>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            void result.refetch();
            if (
              owner &&
              circle.status === "active" &&
              circle.collection_account
            )
              void feed.refetch();
          }}
          disabled={result.isFetching}
        >
          Refresh circle
        </button>
      </div>
      <div aria-live="polite">
        <ErrorNotice error={action.error} />
      </div>
      <section
        className="grid gap-4 sm:grid-cols-3"
        aria-label="Circle summary"
      >
        <Summary label="Scheduled payout per turn" value={money(target)} />
        <Summary
          label="Your collection turn"
          value={`Round ${members.find((m) => m.user_id === session.user_id)?.position ?? "—"}`}
        />
        <Summary
          label={
            circle.status === "completed"
              ? "Recipient-confirmed payouts"
              : "Current contribution due"
          }
          value={
            circle.status === "completed"
              ? `${circle.payouts.filter((p) => p.status === "received").length} of ${circle.member_limit}`
              : dateLabel(due)
          }
        />
      </section>

      {circle.status === "draft" && (
        <section
          className="card-soft mt-6 space-y-5 border border-accent/25 p-6"
          aria-label="Circle agreement"
        >
          <div>
            <h2 className="text-xl font-semibold">Invite, agree, then start</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Every member accepts the final rules, collection account and
              payout order. Changes require everyone to accept again.
            </p>
          </div>
          <label className="block text-sm font-medium">
            Circle invite code
            <input
              className={`${inputClass} font-mono`}
              value={circle.invite_code}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          <ShareButton
            label="Invite on WhatsApp"
            text={() =>
              `Join ${circle.name} on Ajora: ${window.location.origin}/circles?invite=${encodeURIComponent(circle.invite_code)}\nInvite code: ${circle.invite_code}. Contribution: ${money(circle.contribution_kobo)} ${circle.frequency}. Review the agreement before accepting.`
            }
          />
          {owner && (
            <form
              className="panel-inset space-y-3 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void write("/collection-account", {
                  account_id: "demo-collection",
                  label: accountLabel.trim(),
                });
              }}
            >
              <h3 className="font-semibold">Collection account</h3>
              <p className="text-sm text-muted-foreground">
                Try matching with a simulated bank feed. These transactions are
                demo evidence; no real bank account is connected.
              </p>
              <label className="block text-sm font-medium">
                Collection account label
                <input
                  className={inputClass}
                  value={accountLabel}
                  onChange={(event) => setAccountLabel(event.target.value)}
                  minLength={2}
                  maxLength={120}
                  required
                />
              </label>
              <button className="btn-secondary" disabled={action.isPending}>
                Set demo collection account
              </button>
            </form>
          )}
          <p className="text-sm">
            Collection account:{" "}
            <strong>
              {circle.collection_account?.label ??
                "Manual external payment tracking"}
            </strong>
            {circle.collection_account && " · Demo feed"}
          </p>
          <p className="text-sm">
            Agreement version {circle.agreement_version} · {acceptedCount}/
            {members.length} members accepted
          </p>
          <button
            type="button"
            className="btn-secondary"
            disabled={action.isPending || myAcceptance}
            onClick={() =>
              void write("/agreement/accept", {
                version: circle.agreement_version,
              })
            }
          >
            {myAcceptance
              ? "You accepted this agreement"
              : "Accept rules and payout order"}
          </button>
          {owner && (
            <div className="border-t border-border pt-5">
              <button
                type="button"
                className="btn-primary"
                disabled={
                  action.isPending ||
                  members.length !== circle.member_limit ||
                  acceptedCount !== members.length
                }
                onClick={() => {
                  if (
                    window.confirm(
                      "Start this circle with the accepted rules and payout order? Membership and turns will be locked.",
                    )
                  )
                    void write("/start");
                }}
              >
                Start circle
              </button>
              <p className="mt-3 text-xs text-muted-foreground">
                Fill all member places and obtain everyone’s agreement before
                starting.
              </p>
            </div>
          )}
        </section>
      )}

      {circle.status === "active" && (
        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="card-soft p-6">
            <span className="eyebrow">Your contribution · Round {current}</span>
            <h2 className="mt-3 text-2xl font-semibold">
              {money(mine?.confirmed_kobo ?? 0)} of{" "}
              {money(circle.contribution_kobo)} confirmed
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Due {dateLabel(due)}
              {due < localToday() &&
              (mine?.confirmed_kobo ?? 0) < circle.contribution_kobo
                ? " · Outstanding"
                : ""}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Submit each transfer separately, including instalments. Submitted
              payments await organiser review.
            </p>
            {remainingClaim > 0 && !payout && (
              <form
                className="mt-5 space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const kobo = amount
                    ? Math.round(Number(amount) * 100)
                    : remainingClaim;
                  if (
                    await write("/contributions", {
                      round_number: current,
                      reference: reference.trim(),
                      amount_kobo: kobo,
                    })
                  ) {
                    setReference("");
                    setAmount("");
                  }
                }}
              >
                <label className="block text-sm font-medium">
                  Amount paid (₦)
                  <input
                    className={inputClass}
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={remainingClaim / 100}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    disabled={action.isPending}
                    placeholder={String(remainingClaim / 100)}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Contribution reference
                  <input
                    className={inputClass}
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    disabled={action.isPending}
                    required
                    minLength={3}
                    maxLength={200}
                    placeholder="Your transfer reference"
                  />
                </label>
                <button
                  className="btn-primary"
                  disabled={action.isPending || reference.trim().length < 3}
                >
                  Submit contribution
                </button>
              </form>
            )}
            {remainingClaim === 0 && (
              <p className="panel-inset mt-5 p-4 text-sm">
                Your full contribution has been submitted. Check the payment
                statuses below.
              </p>
            )}
          </div>
          <div className="card-soft space-y-4 p-6">
            <span className="eyebrow">
              This round’s collection · {recipient?.display_name}
            </span>
            <h2 className="text-2xl font-semibold">
              {money(confirmed)} confirmed
            </h2>
            <p className="text-sm text-muted-foreground">
              {money(Math.max(0, target - confirmed))} outstanding toward{" "}
              {money(target)}.
            </p>
            <p className="text-xs text-muted-foreground">
              {money(matched)} matched to demo receipts ·{" "}
              {money(confirmed - matched)} manually confirmed. These are
              recorded contributions, not a live bank balance.
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-accent"
                style={{
                  width: `${Math.min(100, (confirmed / target) * 100)}%`,
                }}
              />
            </div>
            <ShareButton
              label="Share round update on WhatsApp"
              text={() =>
                `${circle.name} · Round ${current}\n${money(confirmed)} confirmed; ${money(Math.max(0, target - confirmed))} outstanding. Recipient: ${recipient?.display_name}. Due ${dateLabel(due)}. ${payout ? payoutLabel(payout.status) : "Payout not yet recorded"}. ${matched ? "Includes demo evidence; this is a demonstration." : "External payments, organiser confirmed."}`
              }
            />
            {owner && !payout && (
              <form
                className="space-y-4 border-t border-border pt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (
                    window.confirm(
                      `Record that you sent the payout to ${recipient?.display_name}? The round advances only when the recipient confirms receipt.`,
                    )
                  )
                    void write("/payouts", {
                      round_number: current,
                      reference: payoutReference.trim(),
                    });
                }}
              >
                <label className="block text-sm font-medium">
                  External payout reference
                  <input
                    className={inputClass}
                    value={payoutReference}
                    onChange={(event) => setPayoutReference(event.target.value)}
                    required
                    minLength={3}
                    maxLength={200}
                    disabled={confirmed < target}
                  />
                </label>
                <button
                  className="btn-primary"
                  disabled={
                    action.isPending ||
                    confirmed < target ||
                    payoutReference.trim().length < 3
                  }
                >
                  Record payout sent
                </button>
                <p className="text-xs text-muted-foreground">
                  Record only after sending outside Ajora. The recipient must
                  confirm receipt.
                </p>
              </form>
            )}
            {payout && (
              <div className="panel-inset space-y-3 p-4" role="status">
                <p className="font-semibold">{payoutLabel(payout.status)}</p>
                <p className="break-words text-xs text-muted-foreground">
                  Reference: {payout.reference}
                </p>
                {payout.dispute_reason && (
                  <p className="text-sm text-negative">
                    Reported problem: {payout.dispute_reason}
                  </p>
                )}
                {payout.member_id === session.user_id &&
                  (payout.status === "sent" ||
                    payout.status === "disputed") && (
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={action.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Confirm you received the full payout? This advances the circle to its next round.",
                            )
                          )
                            void write(`/payouts/${current}/receive`);
                        }}
                      >
                        Confirm payout received
                      </button>
                      {payout.status === "sent" && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            askReason(
                              `/payouts/${current}/dispute`,
                              "Report a payout problem",
                            )
                          }
                        >
                          Report payout problem
                        </button>
                      )}
                    </div>
                  )}
              </div>
            )}
          </div>
        </section>
      )}

      {owner && circle.status === "active" && circle.collection_account && (
        <section className="card-soft mt-6 p-6" aria-label="Demo bank matching">
          <h2 className="text-xl font-semibold">Demo bank matching</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {feed.data?.notice ??
              "Simulated receipts for this circle. No live bank verification."}{" "}
            Share the demo references with members to try instalment matching.
          </p>
          <ErrorNotice error={feed.error} retry={() => feed.refetch()} />
          {feed.isPending && (
            <p className="mt-4 text-sm">Loading demo receipts…</p>
          )}
          {feed.data && (
            <>
              <p className="mt-3 text-xs text-muted-foreground">
                Demo feed refreshed {dateLabel(feed.data.refreshed_at)}
              </p>
              <ul className="mt-4 divide-y divide-border">
                {feed.data.transactions.map((receipt) => {
                  const match = (feed.data.matches ?? []).find(
                    (m) => m.transaction_id === receipt.id,
                  );
                  const payment = circle.contributions
                    .flatMap((c) => c.payments ?? [])
                    .find(
                      (p) =>
                        p.receipt_id === receipt.id ||
                        p.id === match?.payment_id,
                    );
                  return (
                    <li
                      key={receipt.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {receipt.sender_name} · {money(receipt.amount_kobo)}
                        </p>
                        <p className="mt-1 break-all font-mono text-xs">
                          {receipt.reference}
                        </p>
                      </div>
                      {match && payment?.status === "submitted" && !payout ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={action.isPending}
                          onClick={() =>
                            void write(`/payments/${match.payment_id}/match`, {
                              transaction_id: receipt.id,
                            })
                          }
                          aria-label={`Approve demo match ${receipt.reference}`}
                        >
                          Approve demo match
                        </button>
                      ) : (
                        <span className="badge-neutral">
                          {payment?.source === "demo" &&
                          payment.status === "confirmed"
                            ? "Demo matched"
                            : "No pending exact match"}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      <section
        className="card-soft mt-6 p-6"
        aria-label="Members and contributions"
      >
        <h2 className="text-xl font-semibold">Members & contributions</h2>
        {circle.status !== "draft" && (
          <label className="mt-4 block max-w-xs text-sm font-medium">
            View contribution round
            <select
              className={inputClass}
              value={shownRound}
              onChange={(event) => setViewRound(Number(event.target.value))}
            >
              {Array.from({ length: current }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Round {i + 1}
                </option>
              ))}
            </select>
          </label>
        )}
        <ul className="mt-5 divide-y divide-border">
          {members.map((member, index) => {
            const contribution = circle.contributions.find(
              (c) =>
                c.member_id === member.user_id && c.round_number === shownRound,
            );
            const accepted = (circle.acceptances ?? []).some(
              (a) =>
                a.member_id === member.user_id &&
                a.version === circle.agreement_version,
            );
            const payments = contribution?.payments ?? [];
            return (
              <li key={member.user_id} className="py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {member.position}. {member.display_name}
                      {member.user_id === session.user_id ? " (you)" : ""}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Collection turn {member.position}
                      {member.user_id === circle.organizer_id
                        ? " · Organiser"
                        : ""}
                    </p>
                  </div>
                  {circle.status === "draft" ? (
                    <div className="flex items-center gap-2">
                      <span className="badge-neutral">
                        {accepted ? "Agreement accepted" : "Acceptance needed"}
                      </span>
                      {owner && (
                        <>
                          <button
                            type="button"
                            className="btn-icon"
                            aria-label={`Move ${member.display_name} earlier`}
                            disabled={action.isPending || index === 0}
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="btn-icon"
                            aria-label={`Move ${member.display_name} later`}
                            disabled={
                              action.isPending || index === members.length - 1
                            }
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <span className="badge-neutral">
                      {money(contribution?.confirmed_kobo ?? 0)} /{" "}
                      {money(circle.contribution_kobo)} confirmed
                    </span>
                  )}
                </div>
                {circle.status !== "draft" && (
                  <div className="mt-4 space-y-3">
                    {payments.map((payment: Payment) => (
                      <div key={payment.id} className="panel-inset p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {money(payment.amount_kobo)} ·{" "}
                              {payment.status === "confirmed"
                                ? payment.source === "demo"
                                  ? "Demo matched"
                                  : "Manually confirmed"
                                : payment.status === "rejected"
                                  ? "Rejected"
                                  : "Submitted · awaiting review"}
                            </p>
                            <p className="mt-1 break-all text-xs text-muted-foreground">
                              Reference: {payment.reference}
                            </p>
                            {payment.rejection_reason && (
                              <p className="mt-2 text-xs text-negative">
                                Reason: {payment.rejection_reason}
                              </p>
                            )}
                          </div>
                          {owner &&
                            shownRound === current &&
                            circle.status === "active" &&
                            !payout && (
                              <div className="flex flex-wrap gap-2">
                                {payment.status === "submitted" && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn-secondary"
                                      disabled={action.isPending}
                                      aria-label={`Manually confirm ${payment.reference}`}
                                      onClick={() =>
                                        void write(
                                          `/payments/${payment.id}/confirm`,
                                        )
                                      }
                                    >
                                      Confirm manually
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-secondary"
                                      onClick={() =>
                                        askReason(
                                          `/payments/${payment.id}/reject`,
                                          `Reject ${payment.reference}`,
                                        )
                                      }
                                    >
                                      Reject payment
                                    </button>
                                  </>
                                )}
                                {payment.status === "confirmed" && (
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() =>
                                      askReason(
                                        `/payments/${payment.id}/revoke`,
                                        `Correct confirmation for ${payment.reference}`,
                                      )
                                    }
                                  >
                                    Correct confirmation
                                  </button>
                                )}
                              </div>
                            )}
                          {member.user_id === session.user_id && (
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() =>
                                askReason(
                                  `/payments/${payment.id}/dispute`,
                                  `Report a problem with ${payment.reference}`,
                                )
                              }
                            >
                              Flag payment for organiser
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {!payments.length && (
                      <p className="text-sm text-muted-foreground">
                        No payment submitted.
                      </p>
                    )}
                    {owner &&
                      shownRound === current &&
                      circle.status === "active" &&
                      (contribution?.confirmed_kobo ?? 0) <
                        circle.contribution_kobo && (
                        <ShareButton
                          label={`Remind ${member.display_name} on WhatsApp`}
                          text={() =>
                            `${circle.name}: ${member.display_name}, ${money(circle.contribution_kobo - (contribution?.confirmed_kobo ?? 0))} remains unconfirmed for round ${current}, due ${dateLabel(due)}. If you have paid, please submit your reference in Ajora. ${window.location.origin}/circles/${id}`
                          }
                        />
                      )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {reasonTarget && (
        <form
          className="card-soft mt-6 space-y-4 border border-negative/30 p-6"
          aria-label="Record a correction or problem"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await write(reasonTarget.path, { reason: reason.trim() }))
              setReasonTarget(null);
          }}
        >
          <h2 className="text-lg font-semibold">{reasonTarget.title}</h2>
          <label className="block text-sm font-medium">
            Reason
            <input
              className={inputClass}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              minLength={3}
              maxLength={500}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {reasonTarget.path.includes("/payments/") &&
            reasonTarget.path.endsWith("/dispute")
              ? "This flags the payment for the organiser and adds your explanation to shared history. It does not change the payment’s confirmation or block payout."
              : "This explanation remains in the circle’s shared history."}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-primary"
              disabled={action.isPending || reason.trim().length < 3}
            >
              Save explanation
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setReasonTarget(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <section className="card-soft mt-6 p-6" aria-label="Payout schedule">
        <h2 className="text-xl font-semibold">Payout turns</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {circle.status === "draft"
            ? "Review this order before accepting the agreement."
            : "The agreed order is locked. A sent record does not establish receipt."}
        </p>
        <ol className="mt-4 divide-y divide-border">
          {members.map((member) => {
            const record = circle.payouts.find(
              (p) => p.round_number === member.position,
            );
            return (
              <li
                key={member.user_id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    Round {member.position} · {member.display_name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {dateLabel(circle.due_dates[member.position - 1])}
                  </p>
                  {record && (
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      Reference: {record.reference}
                    </p>
                  )}
                </div>
                <span
                  className={
                    record?.status === "received" ? "badge" : "badge-neutral"
                  }
                >
                  {record
                    ? payoutLabel(record.status)
                    : member.position === current && circle.status === "active"
                      ? "Current turn"
                      : "Scheduled"}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
      <section className="card-soft mt-6 p-6">
        <h2 className="text-xl font-semibold">Circle rules</h2>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
          {circle.rules || "No additional rules recorded."}
        </p>
      </section>
      <section className="card-soft mt-6 p-6" aria-label="Circle history">
        <h2 className="text-xl font-semibold">Shared history</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Agreement changes, confirmations and problems remain visible here.
        </p>
        <ol className="mt-4 divide-y divide-border">
          {(circle.events ?? []).map((event) => (
            <li key={event.id} className="py-4">
              <p className="text-sm font-semibold">
                {event.kind.replaceAll("_", " ")} · {memberName(event.actor_id)}
              </p>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {event.detail}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {dateLabel(event.at)}
              </p>
              {event.agreement && (
                <AgreementSnapshot agreement={event.agreement} />
              )}
            </li>
          ))}
        </ol>
        {!circle.events?.length && (
          <p className="mt-4 text-sm text-muted-foreground">
            No recorded events for this older circle.
          </p>
        )}
      </section>
      <TrackingNote />
    </>
  );
}
function AgreementSnapshot({
  agreement,
}: {
  agreement: Record<string, unknown>;
}) {
  const order = Array.isArray(agreement.members)
    ? agreement.members.filter((member): member is Record<string, unknown> =>
        Boolean(member && typeof member === "object"),
      )
    : [];
  const account =
    agreement.collection_account &&
    typeof agreement.collection_account === "object"
      ? (agreement.collection_account as Record<string, unknown>)
      : null;
  return (
    <details className="panel-inset mt-3 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        View agreement snapshot
      </summary>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
        <p>
          Version {String(agreement.agreement_version)} ·{" "}
          {typeof agreement.contribution_kobo === "number"
            ? money(agreement.contribution_kobo)
            : "Amount unavailable"}{" "}
          per member · {String(agreement.frequency)}
        </p>
        <p>
          First contribution:{" "}
          {typeof agreement.start_date === "string"
            ? dateLabel(agreement.start_date)
            : "Not recorded"}
        </p>
        <p>
          Collection account:{" "}
          {account
            ? `${String(account.label)} · Demo feed`
            : "Manual external tracking"}
        </p>
        <p className="whitespace-pre-wrap break-words">
          Rules: {String(agreement.rules || "No additional rules recorded.")}
        </p>
        <ol>
          {order.map((member, index) => (
            <li key={index}>
              Round {String(member.position)} · {String(member.display_name)}
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-soft p-5">
      <p className="caption">{label}</p>
      <p className="mt-3 text-xl font-semibold">{value}</p>
    </div>
  );
}
export function CircleDetail({ id }: { id: string }) {
  return (
    <SavingsGate>
      {(session) => <Detail session={session} id={id} />}
    </SavingsGate>
  );
}

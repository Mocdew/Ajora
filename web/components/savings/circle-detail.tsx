"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUp, ArrowDown } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import {
  isSavingsAccessError,
  useBankFeed,
  useCircle,
  useSavingsAction,
  type Circle,
  type SavingsSession,
} from "@/lib/api/savings";
import {
  CircleMode,
  ErrorNotice,
  Loading,
  SavingsActionNotice,
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
      className="btn-secondary max-w-full whitespace-normal break-words text-left"
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
  const action = useSavingsAction(session.user_id, id);
  const blocked = action.isPending || action.uncertain;
  const owner = result.data?.organizer_id === session.user_id;
  const demo = result.data?.mode === "demo";
  const feed = useBankFeed(
    session.user_id,
    id,
    Boolean(
      owner &&
      demo &&
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
    reviewVersion?: number;
  } | null>(null);
  const [reason, setReason] = useState("");
  const reasonInput = useRef<HTMLInputElement>(null);
  const reasonTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (reasonTarget) reasonInput.current?.focus();
  }, [reasonTarget]);
  if (result.isPending) return <Loading />;
  if (!result.data || isSavingsAccessError(result.error))
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
  const disputes = circle.payment_disputes ?? [];
  const payoutHeld = disputes.some((item) => item.round_number === current && !item.resolved_at);
  const myAcceptance = (circle.acceptances ?? []).some(
    (a) =>
      a.member_id === session.user_id && a.version === circle.agreement_version,
  );
  const acceptedCount = (circle.acceptances ?? []).filter(
    (a) => a.version === circle.agreement_version,
  ).length;
  const due = circle.due_dates[current - 1];
  const write = (path: string, body: unknown = {}, onCommitted?: () => void) =>
    action.submit({ path: `/circles/${id}${path}`, body, onCommitted });
  const askReason = (path: string, title: string, reviewVersion?: number) => {
    reasonTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setReasonTarget({ path, title, reviewVersion });
    setReason("");
  };
  const closeReason = () => {
    setReasonTarget(null);
    reasonTrigger.current?.focus();
  };
  const move = (index: number, offset: number) => {
    const ordered = members.map((m) => m.user_id);
    [ordered[index], ordered[index + offset]] = [
      ordered[index + offset],
      ordered[index],
    ];
    void write("/order", { member_ids: ordered, agreement_version: circle.agreement_version });
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
              : circle.status === "cancelled" ? "Draft cancelled" : "Circle completed"
        }
        title={circle.name}
        description={`${money(circle.contribution_kobo)} per member · ${circle.frequency} · ${members.length}/${circle.member_limit} members`}
        actions={
          <div className="flex flex-wrap gap-2">
            <CircleMode mode={circle.mode} />
            <span className="badge-neutral">{owner ? "Organiser" : "Member"} · {circle.status}</span>
          </div>
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
              demo &&
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
      {result.error && <p role="status" className="mb-3 text-sm text-muted-foreground">Ajora couldn’t refresh this circle. You’re viewing the last update.</p>}
      <div className="mb-4"><SavingsActionNotice action={action} /></div>
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
              Every member accepts the final rules and payout order. Changes require everyone to accept again.
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
              `${demo ? "Demo circle · " : ""}Join ${circle.name} on Ajora: ${window.location.origin}/circles?invite=${encodeURIComponent(circle.invite_code)}\nInvite code: ${circle.invite_code}. Contribution: ${money(circle.contribution_kobo)} ${circle.frequency}. Review the agreement before accepting.`
            }
          />
          {owner && demo && (
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
              <button className="btn-secondary" disabled={blocked}>
                Set demo collection account
              </button>
            </form>
          )}
          <p className="text-sm">
            Payment tracking ·{" "}
            <strong>
              {circle.collection_account?.label ??
                (demo ? "Simulated practice records" : "Manual external payment tracking")}
            </strong>
            {circle.collection_account && " · Demo feed"}
          </p>
          <p className="text-sm">
            Agreement version {circle.agreement_version} · {acceptedCount}/
            {members.length} members accepted
          </p>
          <a href="#payment-instructions" className="link-accent text-sm">Read the circle rules and payment instructions</a>
          <button
            type="button"
            className="btn-secondary"
            disabled={blocked || myAcceptance}
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
                  blocked ||
                  members.length !== circle.member_limit ||
                  acceptedCount !== members.length
                }
                onClick={() => {
                  if (
                    window.confirm(
                      "Start this circle with the accepted rules and payout order? Membership and turns will be locked.",
                    )
                  )
                    void write("/start", { agreement_version: circle.agreement_version });
                }}
              >
                Start circle
              </button>
              <p className="mt-3 text-xs text-muted-foreground">
                Fill all member places and obtain everyone’s agreement before
                starting.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" className="btn-secondary" disabled={blocked} onClick={() => {
                  if (window.confirm("Replace the invite code? The previous link will stop working. Current members will keep their places.")) void write("/rotate-invite");
                }}>Replace invite code</button>
                <button type="button" className="btn-secondary" disabled={blocked} onClick={() => {
                  if (window.confirm("Cancel this draft? The invite will close and members will be able to read the draft history.")) void write("/cancel-draft");
                }}>Cancel draft</button>
              </div>
            </div>
          )}
        </section>
      )}
      {circle.status === "cancelled" && <p role="status" className="panel-inset mt-6 p-4 text-sm">This draft is closed. Any replacement circle needs a new invitation and a new agreement.</p>}

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
            {!demo && <a href="#payment-instructions" className="link-accent mt-3 text-sm">View agreed payment instructions</a>}
            {remainingClaim > 0 && !payout && (
              <form
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const kobo = amount
                    ? Math.round(Number(amount) * 100)
                    : remainingClaim;
                  void write("/contributions", {
                      round_number: current,
                      reference: reference.trim(),
                      amount_kobo: kobo,
                    }, () => {
                    setReference("");
                    setAmount("");
                  });
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
                    disabled={blocked}
                    placeholder={String(remainingClaim / 100)}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Contribution reference
                  <input
                    className={inputClass}
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    disabled={blocked}
                    required
                    minLength={3}
                    maxLength={200}
                    placeholder="Your transfer reference"
                  />
                </label>
                <button
                  className="btn-primary"
                  disabled={blocked || reference.trim().length < 3}
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
              {demo
                ? `${money(matched)} matched to simulated receipts · ${money(confirmed - matched)} manually recorded in this demo.`
                : "The organiser confirms recorded contributions against external payments."}
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
                `${demo ? "Demo circle · " : ""}${circle.name} · Round ${current}\n${money(confirmed)} confirmed; ${money(Math.max(0, target - confirmed))} outstanding. Recipient: ${recipient?.display_name}. Due ${dateLabel(due)}. ${payout ? payoutLabel(payout.status) : "Payout not yet recorded"}. ${demo ? "Practice records and simulated evidence." : "External payments, organiser confirmed."}`
              }
            />
            {payoutHeld && <p role="status" className="panel-inset p-4 text-sm">Payout is on hold while an open payment case for this round is reviewed. See Payment cases below.</p>}
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
                    disabled={blocked || payoutHeld || confirmed < target}
                  />
                </label>
                <button
                  className="btn-primary"
                  disabled={
                    blocked || payoutHeld ||
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
                  <p className="break-words text-sm text-negative">
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
                        disabled={blocked || payoutHeld}
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
                          disabled={blocked}
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

      {owner && demo && circle.status === "active" && circle.collection_account && (
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
                          disabled={blocked}
                          onClick={() =>
                            void write(`/payments/${match.payment_id}/match`, {
                              transaction_id: receipt.id,
                              review_version: payment.review_version ?? 1,
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
        {owner && !demo && circle.status === "active" && <p className="mt-2 text-sm text-muted-foreground">Before confirming, compare the reference and amount with the external receipt. Check every circle using the same collection account so the receipt is credited once.</p>}
        {(circle.status === "active" || circle.status === "completed") && (
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
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold">
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge-neutral">
                        {accepted ? "Agreement accepted" : "Acceptance needed"}
                      </span>
                      {owner && (
                        <>
                          <button
                            type="button"
                            className="btn-icon"
                            aria-label={`Move ${member.display_name} earlier`}
                            disabled={blocked || index === 0}
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="btn-icon"
                            aria-label={`Move ${member.display_name} later`}
                            disabled={
                              blocked || index === members.length - 1
                            }
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  ) : circle.status !== "cancelled" && (
                    <span className="badge-neutral">
                      {money(contribution?.confirmed_kobo ?? 0)} /{" "}
                      {money(circle.contribution_kobo)} confirmed
                    </span>
                  )}
                </div>
                {(circle.status === "active" || circle.status === "completed") && (
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
                              <p className="mt-2 break-words text-xs text-negative">
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
                                      disabled={blocked}
                                      aria-label={`Manually confirm ${payment.reference}`}
                                      onClick={() =>
                                        void write(
                                          `/payments/${payment.id}/confirm`,
                                          { review_version: payment.review_version ?? 1 },
                                        )
                                      }
                                    >
                                      Confirm manually
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-secondary"
                                      disabled={blocked}
                                      onClick={() =>
                                        askReason(
                                          `/payments/${payment.id}/reject`,
                                          `Reject ${payment.reference}`,
                                          payment.review_version ?? 1,
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
                                    disabled={blocked}
                                    onClick={() =>
                                      askReason(
                                        `/payments/${payment.id}/revoke`,
                                        `Correct confirmation for ${payment.reference}`,
                                        payment.review_version ?? 1,
                                      )
                                    }
                                  >
                                    Correct confirmation
                                  </button>
                                )}
                              </div>
                            )}
                          {member.user_id === session.user_id && !disputes.some((item) => item.payment_id === payment.id && item.opened_by === session.user_id && !item.resolved_at) && (
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={blocked}
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
                            `${demo ? "Demo circle · " : ""}${circle.name}: ${member.display_name}, ${money(circle.contribution_kobo - (contribution?.confirmed_kobo ?? 0))} remains unconfirmed for round ${current}, due ${dateLabel(due)}. ${demo ? "Use a practice reference in Ajora." : "If you have paid, please submit your reference in Ajora."} ${window.location.origin}/circles/${id}`
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

      {disputes.length > 0 && (
        <section className="card-soft mt-6 p-6" aria-label="Payment cases">
          <h2 className="text-xl font-semibold">Payment cases</h2>
          <ul className="mt-4 divide-y divide-border">
            {disputes.map((item) => (
              <li key={item.id} className="space-y-2 py-4 text-sm">
                <p className="break-words font-semibold">Round {item.round_number} · {item.resolved_at ? "Resolved" : "Open"} · {memberName(item.opened_by)}</p>
                <p className="break-all text-xs text-muted-foreground">Case {item.id} · {dateLabel(item.opened_at)}</p>
                <p className="break-words">{item.reason}</p>
                {item.resolved_at ? <p className="break-words text-muted-foreground">Resolved {dateLabel(item.resolved_at)} · {item.resolution}</p> : item.opened_by === session.user_id && (
                  <button type="button" className="btn-secondary" disabled={blocked} onClick={() => askReason(`/payment-disputes/${item.id}/resolve`, `Resolve case ${item.id}`)}>Resolve my payment case</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {reasonTarget && (
        <form
          className="card-soft mt-6 space-y-4 border border-negative/30 p-6"
          aria-label="Record a correction or problem"
          onSubmit={(event) => {
            event.preventDefault();
            void write(reasonTarget.path, {
              reason: reason.trim(),
              ...(reasonTarget.reviewVersion === undefined ? {} : { review_version: reasonTarget.reviewVersion }),
            }, closeReason);
          }}
        >
          <h2 className="break-words text-lg font-semibold">{reasonTarget.title}</h2>
          <label className="block text-sm font-medium">
            Reason
            <input
              ref={reasonInput}
              className={inputClass}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              minLength={3}
              maxLength={500}
              disabled={blocked}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {reasonTarget.path.includes("/payments/") &&
            reasonTarget.path.endsWith("/dispute")
              ? "Members can read this case. An open case for the current round holds payout recording and receipt confirmation until you resolve it."
              : "This explanation remains in the circle’s shared history."}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-primary"
              disabled={blocked || reason.trim().length < 3}
            >
              Save explanation
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={blocked}
              onClick={closeReason}
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
                  <p className="break-words text-sm font-semibold">
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
      <section id="payment-instructions" className="card-soft mt-6 scroll-mt-24 p-6" aria-label="Circle rules">
        <h2 className="text-xl font-semibold">{demo ? "Demo circle rules" : "Agreed payment instructions and rules"}</h2>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
          {circle.rules || "No additional rules recorded."}
        </p>
      </section>
      <section className="card-soft mt-6 p-6" aria-label="Circle history">
        <h2 className="text-xl font-semibold">{demo ? "Shared demo history" : "Shared history"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Agreement changes, confirmations and problems remain visible here.
        </p>
        <ol className="mt-4 divide-y divide-border">
          {(circle.events ?? []).map((event) => (
            <li key={event.id} className="py-4">
              <p className="break-words text-sm font-semibold">
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
      {(session) => <Detail key={id} session={session} id={id} />}
    </SavingsGate>
  );
}

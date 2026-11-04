"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Copy,
  CheckCircle,
  Clock,
} from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import {
  useCircle,
  useSavingsAction,
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

function Detail({ session, id }: { session: SavingsSession; id: string }) {
  const result = useCircle(session.user_id, id);
  const action = useSavingsAction();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [reference, setReference] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [viewRound, setViewRound] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  if (result.isPending) return <Loading />;
  if (result.error || !result.data)
    return (
      <>
        <Link href="/circles" className="link-accent mb-5">
          <ArrowLeft className="h-4 w-4" />
          My circles
        </Link>
        <ErrorNotice error={result.error} retry={() => result.refetch()} />
      </>
    );
  const circle = result.data;
  const owner = circle.organizer_id === session.user_id;
  const members = [...circle.members].sort((a, b) => a.position - b.position);
  const current = circle.current_round;
  const historyRound = viewRound ?? current;
  const historyContributions = circle.contributions.filter(
    (p) => p.round_number === historyRound,
  );
  const contribution = circle.contributions.find(
    (p) => p.member_id === session.user_id && p.round_number === current,
  );
  const roundContributions = circle.contributions.filter(
    (p) => p.round_number === current,
  );
  const confirmed = roundContributions.filter(
    (p) => p.status === "confirmed",
  ).length;
  const myTurn = members.find((m) => m.user_id === session.user_id)?.position;
  const recipient = members.find((m) => m.position === current);
  const due = circle.due_dates[current - 1];
  const overdue = due && due < localToday();
  const write = async (path: string, body: unknown = {}) => {
    try {
      await action.mutateAsync({ path: `/circles/${id}${path}`, body });
    } catch {
      /* shared error notice */
    }
  };
  const move = (index: number, offset: number) => {
    const ordered = members.map((m) => m.user_id);
    [ordered[index], ordered[index + offset]] = [
      ordered[index + offset],
      ordered[index],
    ];
    void write("/order", { member_ids: ordered });
  };
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
              : "A full circle, completed"
        }
        title={circle.name}
        description={`${money(circle.contribution_kobo)} per member · ${circle.frequency} · ${circle.members.length}/${circle.member_limit} members`}
        actions={
          <span
            className={circle.status === "active" ? "badge" : "badge-neutral"}
          >
            {owner ? "Organiser" : "Member"} · {circle.status}
          </span>
        }
      />
      <div aria-live="polite">
        <ErrorNotice error={action.error} />
      </div>
      <section
        className="grid gap-4 sm:grid-cols-3"
        aria-label="Circle summary"
      >
        <Summary
          label="Scheduled payout per turn"
          value={money(circle.contribution_kobo * circle.member_limit)}
        />
        <Summary
          label="Your collection turn"
          value={myTurn ? `Round ${myTurn}` : "Not assigned"}
        />
        <Summary
          label={
            circle.status === "completed"
              ? "Payouts recorded"
              : "First / current due date"
          }
          value={
            circle.status === "completed"
              ? `${circle.payouts.length} of ${circle.member_limit}`
              : dateLabel(due)
          }
        />
      </section>
      {circle.status === "draft" && (
        <section className="card-soft mt-6 border border-accent/25 p-6">
          <h2 className="text-xl font-semibold">Invite, agree, then start</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Share this private code with your members. Review the rules and
            payout order together before the organiser starts the circle.
          </p>
          <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:items-end">
            <label className="block min-w-0 flex-1 text-sm font-medium">
              Circle invite code
              <input
                className={`${inputClass} font-mono`}
                value={circle.invite_code}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
            <button
              className="btn-secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(circle.invite_code);
                  setCopied(true);
                  setCopyError("");
                } catch {
                  setCopyError("Select and copy the invite code above.");
                }
              }}
            >
              <Copy className="h-4 w-4" />
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            {copyError}
          </p>
          {owner && (
            <div className="mt-5 border-t border-border pt-5">
              <button
                className="btn-primary"
                disabled={
                  action.isPending || members.length !== circle.member_limit
                }
                onClick={() => {
                  if (
                    window.confirm(
                      "Start this circle? Membership and payout order will be locked for all rounds.",
                    )
                  )
                    void write("/start");
                }}
              >
                Start circle
              </button>
              <p className="mt-3 text-xs text-muted-foreground">
                {members.length < circle.member_limit
                  ? `${circle.member_limit - members.length} more member${circle.member_limit - members.length === 1 ? "" : "s"} needed before starting.`
                  : "Starting locks membership and the payout order shown below."}
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
              {money(circle.contribution_kobo)}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Due {dateLabel(due)}
              {overdue && !contribution ? " · Overdue" : ""}
            </p>
            {contribution && contribution.status !== "rejected" ? (
              <div className="panel-inset mt-5 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {contribution.status === "confirmed" ? (
                    <CheckCircle className="h-5 w-5 text-accent" />
                  ) : (
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  )}
                  {contribution.status === "confirmed"
                    ? "Contribution confirmed"
                    : "Awaiting organiser confirmation"}
                </p>
                <p className="mt-2 break-words text-xs text-muted-foreground">
                  Reference: {contribution.reference}
                </p>
              </div>
            ) : (
              <form
                className="mt-5 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void write("/contributions", {
                    round_number: current,
                    reference: reference.trim(),
                  });
                }}
              >
                {contribution?.status === "rejected" && (
                  <p
                    role="status"
                    className="rounded-xl bg-negative/10 p-3 text-sm text-negative"
                  >
                    Your reference was rejected: {contribution.rejection_reason}
                    . Check your payment and submit a corrected reference.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Already paid outside Ajora? Submit the payment reference for
                  the organiser to verify.
                </p>
                <label className="block text-sm font-medium">
                  Contribution reference
                  <input
                    className={inputClass}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    required
                    minLength={3}
                    maxLength={200}
                    placeholder="Your bank transfer reference"
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
          </div>
          <div className="card-soft p-6">
            <span className="eyebrow">This round’s collection</span>
            <h2 className="mt-3 text-2xl font-semibold">
              {recipient?.display_name}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {confirmed} of {members.length} contributions confirmed
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(confirmed / circle.member_limit) * 100}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {money(confirmed * circle.contribution_kobo)} confirmed toward the{" "}
              {money(circle.contribution_kobo * circle.member_limit)} scheduled
              payout.
            </p>
            {owner && (
              <form
                className="mt-5 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    window.confirm(
                      `Record an external payout to ${recipient?.display_name} for round ${current}? This advances the circle to its next round.`,
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
                    onChange={(e) => setPayoutReference(e.target.value)}
                    required
                    minLength={3}
                    maxLength={200}
                    placeholder="Reference after sending the payout"
                    disabled={confirmed !== circle.member_limit}
                  />
                </label>
                <button
                  className="btn-primary"
                  disabled={
                    action.isPending ||
                    confirmed !== circle.member_limit ||
                    payoutReference.trim().length < 3
                  }
                >
                  Record payout
                </button>
                <p className="text-xs text-muted-foreground">
                  Record only after sending the money outside Ajora. Every
                  contribution must be confirmed first.
                </p>
              </form>
            )}
          </div>
        </section>
      )}
      {circle.status === "completed" && (
        <div className="mt-6 rounded-2xl border border-accent/30 bg-accent/10 p-6">
          <CheckCircle className="h-7 w-7 text-accent" />
          <h2 className="mt-3 text-xl font-semibold">
            Every turn accounted for
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            All {circle.member_limit} payouts have been recorded. Your circle’s
            contributions and payout history remain available below.
          </p>
        </div>
      )}
      <section
        className="card-soft mt-6 p-6"
        aria-label="Members and contributions"
      >
        <h2 className="text-xl font-semibold">Members & contributions</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {circle.status === "draft"
            ? "Members appear in their payout order. The organiser can adjust turns before starting."
            : `Round ${historyRound} · Only confirmed payments count as received.`}
        </p>
        {circle.status !== "draft" && (
          <label className="mt-4 block max-w-xs text-sm font-medium">
            View contribution round
            <select
              className={inputClass}
              value={historyRound}
              onChange={(e) => setViewRound(Number(e.target.value))}
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
            const payment = historyContributions.find(
              (p) => p.member_id === member.user_id,
            );
            return (
              <li
                key={member.user_id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
                    {member.position}
                  </span>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold">
                      {member.display_name}
                      {member.user_id === session.user_id ? " (you)" : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {member.user_id === circle.organizer_id
                        ? "Organiser · "
                        : ""}
                      Collection turn {member.position}
                    </p>
                    {payment && (
                      <p className="mt-1 max-w-xs break-words text-xs text-muted-foreground">
                        Ref: {payment.reference}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {circle.status === "draft" ? (
                    owner && (
                      <>
                        <button
                          className="btn-icon"
                          aria-label={`Move ${member.display_name} earlier`}
                          disabled={action.isPending || index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
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
                    )
                  ) : (
                    <>
                      <span
                        className={
                          payment?.status === "confirmed"
                            ? "badge"
                            : payment?.status === "rejected" ||
                                (overdue && !payment)
                              ? "badge-negative"
                              : "badge-neutral"
                        }
                      >
                        {payment?.status === "confirmed"
                          ? "Confirmed"
                          : payment?.status === "rejected"
                            ? "Rejected"
                            : payment
                              ? "Submitted"
                              : overdue
                                ? "Overdue"
                                : "Due"}
                      </span>
                      {owner &&
                        historyRound === current &&
                        circle.status === "active" &&
                        payment?.status === "submitted" && (
                          <>
                            <button
                              className="btn-secondary"
                              aria-label={`Confirm contribution from ${member.display_name}`}
                              disabled={action.isPending}
                              onClick={() =>
                                void write(
                                  `/contributions/${member.user_id}/${current}/confirm`,
                                )
                              }
                            >
                              Confirm received
                            </button>
                            <button
                              className="btn-danger"
                              disabled={action.isPending}
                              onClick={() => {
                                setRejecting(member.user_id);
                                setRejectionReason("");
                              }}
                            >
                              Reject reference from {member.display_name}
                            </button>
                          </>
                        )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      {rejecting && (
        <form
          className="card-soft mt-6 space-y-4 border border-negative/30 p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await action.mutateAsync({
                path: `/circles/${id}/contributions/${rejecting}/${current}/reject`,
                body: { reason: rejectionReason.trim() },
              });
              setRejecting(null);
            } catch {
              /* shown above */
            }
          }}
        >
          <h2 className="text-lg font-semibold">
            Reject contribution reference
          </h2>
          <label className="block text-sm font-medium">
            Reason for rejection
            <input
              className={inputClass}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              required
              minLength={3}
              maxLength={500}
              placeholder="Explain what the member needs to correct"
            />
          </label>
          <div className="flex gap-3">
            <button
              className="btn-danger"
              disabled={action.isPending || rejectionReason.trim().length < 3}
            >
              Reject reference
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setRejecting(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <section className="card-soft mt-6 p-6" aria-label="Payout schedule">
        <h2 className="text-xl font-semibold">Payout turns</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          One collection per member.{" "}
          {circle.status === "draft"
            ? "Order is provisional until the circle starts."
            : "The agreed order is locked for this circle."}
        </p>
        <ol className="mt-5 divide-y divide-border">
          {members.map((member) => {
            const payout = circle.payouts.find(
              (p) => p.round_number === member.position,
            );
            return (
              <li
                key={member.user_id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <p className="text-sm font-semibold">
                    Round {member.position} · {member.display_name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {dateLabel(circle.due_dates[member.position - 1])}
                  </p>
                  {payout && (
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      Reference: {payout.reference} ·{" "}
                      {dateLabel(payout.recorded_at)}
                    </p>
                  )}
                </div>
                <span
                  className={
                    payout
                      ? "badge"
                      : circle.status === "active" &&
                          member.position === current
                        ? "badge"
                        : "badge-neutral"
                  }
                >
                  {payout
                    ? "Payout recorded"
                    : circle.status === "active" && member.position === current
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
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
          {circle.rules}
        </p>
      </section>
      <TrackingNote />
    </>
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

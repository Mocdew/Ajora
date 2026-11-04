"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import { useCircles, type SavingsSession } from "@/lib/api/savings";
import {
  ErrorNotice,
  Loading,
  SavingsGate,
  TrackingNote,
  dateLabel,
  money,
} from "./shared";

function Activity({ session }: { session: SavingsSession }) {
  const result = useCircles(session.user_id);
  if (result.isPending) return <Loading />;
  if (result.error)
    return <ErrorNotice error={result.error} retry={() => result.refetch()} />;
  const events = (result.data ?? [])
    .flatMap((circle) => [
      ...circle.contributions
        .filter((c) => c.member_id === session.user_id)
        .map((c) => ({
          id: `${circle.id}-contribution-${c.round_number}`,
          circleId: circle.id,
          circleName: circle.name,
          round: c.round_number,
          at: c.rejected_at ?? c.confirmed_at ?? c.submitted_at,
          reference: c.reference,
          reason: c.rejection_reason,
          amount: circle.contribution_kobo,
          incoming: false,
          title: "Your contribution",
          status:
            c.status === "confirmed"
              ? "Confirmed"
              : c.status === "rejected"
                ? "Rejected"
                : "Awaiting confirmation",
        })),
      ...circle.payouts.map((p) => ({
        id: `${circle.id}-payout-${p.round_number}`,
        circleId: circle.id,
        circleName: circle.name,
        round: p.round_number,
        at: p.recorded_at,
        reference: p.reference,
        reason: null,
        amount: p.amount_kobo,
        incoming: true,
        title:
          p.member_id === session.user_id
            ? "Your payout"
            : `Payout to ${circle.members.find((m) => m.user_id === p.member_id)?.display_name ?? "member"}`,
        status: "Payout recorded",
      })),
    ])
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <>
      <PageHeader
        eyebrow="Your circle records"
        title="Activity"
        description="Your contribution submissions and your circles’ recorded payouts. These are records of payments made outside Ajora."
      />
      {events.length ? (
        <section
          className="card-soft divide-y divide-border px-5 sm:px-6"
          aria-label="Savings activity"
        >
          {events.map((event) => (
            <article
              key={event.id}
              className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-accent">
                  {event.incoming ? (
                    <ArrowDownLeft className="h-5 w-5" />
                  ) : (
                    <ArrowUpRight className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{event.title}</p>
                  <Link
                    href={`/circles/${event.circleId}`}
                    className="mt-1 inline-block text-sm text-accent"
                  >
                    {event.circleName} · Round {event.round}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {dateLabel(event.at)}
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    Ref: <span>{event.reference}</span>
                  </p>
                  {event.reason && (
                    <p className="mt-1 break-words text-xs text-negative">
                      Reason: {event.reason}
                    </p>
                  )}
                </div>
              </div>
              <div className="sm:text-right">
                <p className="font-semibold tabular-nums">
                  {money(event.amount)}
                </p>
                <span
                  className={
                    event.status === "Rejected"
                      ? "badge-negative mt-2"
                      : event.status === "Awaiting confirmation"
                        ? "badge-neutral mt-2"
                        : "badge mt-2"
                  }
                >
                  {event.status}
                </span>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="card-soft p-10 text-center">
          <h2 className="text-xl font-semibold">
            Your savings story starts here
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Contribution submissions and recorded payouts will appear as your
            circles get moving.
          </p>
          <Link href="/circles" className="btn-primary mt-5">
            View my circles
          </Link>
        </div>
      )}
      <TrackingNote />
    </>
  );
}
export function SavingsActivity() {
  return (
    <SavingsGate>{(session) => <Activity session={session} />}</SavingsGate>
  );
}

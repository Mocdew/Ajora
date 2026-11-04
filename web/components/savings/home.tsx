"use client";

import Link from "next/link";
import {
  ArrowRight,
  Plus,
  CalendarBlank,
  ArrowUpRight,
  Stack,
  UsersThree,
  HandCoins,
} from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import { useCircles, type SavingsSession } from "@/lib/api/savings";
import { CircleMotif } from "./circle-motif";
import {
  CircleCard,
  EmptyCircles,
  ErrorNotice,
  Loading,
  SavingsGate,
  TrackingNote,
  dateLabel,
  money,
} from "./shared";

function Home({ session }: { session: SavingsSession }) {
  const circles = useCircles(session.user_id);
  if (circles.isPending) return <Loading />;
  if (circles.error)
    return (
      <ErrorNotice error={circles.error} retry={() => circles.refetch()} />
    );
  const all = circles.data ?? [];
  const active = all.filter((c) => c.status === "active");
  const upcoming = active
    .filter(
      (c) =>
        !c.contributions.some(
          (p) =>
            p.member_id === session.user_id &&
            p.round_number === c.current_round &&
            p.confirmed_kobo >= c.contribution_kobo,
        ),
    )
    .sort((a, b) =>
      (a.due_dates[a.current_round - 1] ?? "").localeCompare(
        b.due_dates[b.current_round - 1] ?? "",
      ),
    )[0];
  const contributed = all.reduce(
    (total, c) =>
      total +
      c.contributions
        .filter((p) => p.member_id === session.user_id)
        .reduce((sum, p) => sum + p.confirmed_kobo, 0),
    0,
  );
  const demoContributed = all.reduce(
    (total, circle) =>
      total +
      circle.contributions
        .filter((contribution) => contribution.member_id === session.user_id)
        .reduce((sum, contribution) => sum + contribution.matched_kobo, 0),
    0,
  );
  const upcomingRemaining = upcoming
    ? upcoming.contribution_kobo -
      (upcoming.contributions.find(
        (payment) =>
          payment.member_id === session.user_id &&
          payment.round_number === upcoming.current_round,
      )?.confirmed_kobo ?? 0)
    : 0;
  const received = all.reduce(
    (total, c) =>
      total +
      c.payouts
        .filter(
          (p) => p.member_id === session.user_id && p.status === "received",
        )
        .reduce((sum, p) => sum + p.amount_kobo, 0),
    0,
  );
  return (
    <>
      <PageHeader
        eyebrow={`Welcome, ${session.display_name}`}
        title="Save together. Grow together."
        description="Your circles, your contributions, and your next turn — all in one place."
        actions={
          <Link href="/circles" className="btn-primary">
            <Plus className="h-4 w-4" />
            Create or join
          </Link>
        }
      />
      <section
        className="savings-summary grid overflow-hidden rounded-2xl border border-border bg-card sm:grid-cols-3"
        aria-label="Your savings summary"
      >
        {[
          { label: "Your confirmed contributions", value: money(contributed), icon: Stack, detail: "Your savings, recorded" },
          { label: "Your received payouts", value: money(received), icon: HandCoins, detail: "Receipt confirmed by you" },
          { label: "Active circles", value: String(active.length), icon: UsersThree, detail: "Growing together" },
        ].map(({ label, value, icon: Icon, detail }) => (
          <div key={label} className="savings-stat min-w-0 border-b border-border p-6 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 lg:p-7">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs leading-5 text-muted-foreground">{label}</p>
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden />
            </div>
            <p className="mt-5 overflow-x-auto whitespace-nowrap font-mono text-3xl font-normal tracking-tighter xl:text-4xl">
              {value}
            </p>
            <p className="mt-3 text-[11px] text-muted-foreground">{detail}</p>
          </div>
        ))}
      </section>
      {demoContributed > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Recorded contributions include {money(demoContributed)} matched to
          simulated demo receipts. Demo records do not verify real payments.
        </p>
      )}
      <section
        className="savings-next-step relative my-7 overflow-hidden rounded-2xl border p-6 sm:p-8 lg:p-9"
        aria-label="Next contribution"
      >
        <CircleMotif className="feature-orbit -right-20 -top-12 h-[360px] w-[528px]" />
        <div className="relative flex flex-col justify-between gap-7 sm:flex-row sm:items-end">
          <div className="max-w-xl">
            <span className="eyebrow">Your next step</span>
            <h2 className="mt-4 max-w-lg text-2xl font-normal leading-snug tracking-tight sm:text-3xl">
              {upcoming
                ? `${money(upcomingRemaining)} remaining for ${upcoming.name}`
                : active.length
                  ? "Your submissions are up to date"
                  : "Build a savings habit with your people"}
            </h2>
            <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-muted-foreground">
              <CalendarBlank className="mt-1 h-4 w-4 shrink-0" aria-hidden />
              {upcoming
                ? `Due ${dateLabel(upcoming.due_dates[upcoming.current_round - 1])} · Round ${upcoming.current_round}`
                : active.length
                  ? "Open a circle to check confirmations and payout turns."
                  : "Create a circle or join one with an invite code."}
            </p>
          </div>
          <Link
            className="btn-secondary shrink-0 self-start sm:self-auto"
            href={upcoming ? `/circles/${upcoming.id}` : "/circles"}
          >
            {upcoming ? "View contribution" : "View my circles"}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
      <div className="mb-5 mt-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-medium tracking-tight">Your circles</h2>
            <p className="mt-1 text-xs text-muted-foreground">Good things grow in good company.</p>
          </div>
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full border border-border px-1.5 font-mono text-[11px] text-muted-foreground">{all.length}</span>
        </div>
        {all.length > 0 && (
          <Link href="/circles" className="link-accent">
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      {all.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {all.slice(0, 4).map((c) => (
            <CircleCard key={c.id} circle={c} />
          ))}
        </div>
      ) : (
        <EmptyCircles />
      )}
      <TrackingNote />
    </>
  );
}
export function SavingsHome() {
  return <SavingsGate>{(session) => <Home session={session} />}</SavingsGate>;
}

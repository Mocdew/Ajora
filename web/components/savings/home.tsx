"use client";

import Link from "next/link";
import {
  ArrowRight,
  Plus,
  CalendarBlank,
} from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import { useCircles, type SavingsSession } from "@/lib/api/savings";
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
            p.status !== "rejected",
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
      c.contributions.filter(
        (p) => p.member_id === session.user_id && p.status === "confirmed",
      ).length *
        c.contribution_kobo,
    0,
  );
  const received = all.reduce(
    (total, c) =>
      total +
      c.payouts
        .filter((p) => p.member_id === session.user_id)
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
        className="grid gap-4 sm:grid-cols-3"
        aria-label="Your savings summary"
      >
        {[
          ["Your confirmed contributions", money(contributed)],
          ["Your recorded payouts", money(received)],
          ["Active circles", String(active.length)],
        ].map(([label, value]) => (
          <div key={label} className="card-soft p-6">
            <p className="caption">{label}</p>
            <p className="mt-4 text-3xl font-semibold tracking-tight">
              {value}
            </p>
          </div>
        ))}
      </section>
      <section
        className="my-6 rounded-2xl border border-accent/30 bg-accent/10 p-6 sm:p-8"
        aria-label="Next contribution"
      >
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <span className="eyebrow">Your next step</span>
            <h2 className="mt-3 text-2xl font-semibold">
              {upcoming
                ? `${money(upcoming.contribution_kobo)} for ${upcoming.name}`
                : active.length
                  ? "Your submissions are up to date"
                  : "Build a savings habit with your people"}
            </h2>
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarBlank className="h-4 w-4 shrink-0" aria-hidden />
              {upcoming
                ? `Due ${dateLabel(upcoming.due_dates[upcoming.current_round - 1])} · Round ${upcoming.current_round}`
                : active.length
                  ? "Open a circle to check confirmations and payout turns."
                  : "Create a circle or join one with an invite code."}
            </p>
          </div>
          <Link
            className="btn-primary shrink-0"
            href={upcoming ? `/circles/${upcoming.id}` : "/circles"}
          >
            {upcoming ? "View contribution" : "View my circles"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Your circles</h2>
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

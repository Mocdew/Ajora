"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  UsersThree,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import { EngineError } from "@/lib/api/engine";
import {
  useSavingsAction,
  useSavingsSession,
  type SavingsSession,
  type Circle,
} from "@/lib/api/savings";
import { formatNaira } from "@/lib/utils";

export const inputClass =
  "mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm text-foreground";
export function money(kobo: number) {
  return formatNaira(kobo / 100, {
    minimumFractionDigits: kobo % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  });
}
export function dateLabel(value?: string) {
  return value
    ? new Intl.DateTimeFormat("en-NG", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Africa/Lagos",
      }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value))
    : "Not scheduled";
}
export function localToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="rounded-xl bg-negative/10 p-4 text-sm text-negative"
    >
      <p>
        {error instanceof Error
          ? error.message
          : "Something went wrong. Please try again."}
      </p>
      {retry && (
        <button type="button" className="btn-secondary mt-3" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function Loading() {
  return (
    <div role="status" className="card-soft p-8 text-sm text-muted-foreground">
      Loading your savings…
    </div>
  );
}
export function SavingsGate({
  children,
}: {
  children: (session: SavingsSession) => ReactNode;
}) {
  const session = useSavingsSession();
  const create = useSavingsAction<SavingsSession>();
  const client = useQueryClient();
  const [name, setName] = useState("");
  if (session.isPending) return <Loading />;
  const unauthorized =
    session.error instanceof EngineError && session.error.status === 401;
  if (session.data && !unauthorized) return <>{children(session.data)}</>;
  if (!unauthorized)
    return (
      <ErrorNotice error={session.error} retry={() => session.refetch()} />
    );
  return (
    <div className="mx-auto max-w-xl py-8">
      <span className="eyebrow">Ajo, together</span>
      <h1 className="mt-4 text-4xl font-bold tracking-tight">
        Small contributions.
        <br />
        <span className="text-accent">Shared possibilities.</span>
      </h1>
      <p className="mt-5 text-muted-foreground">
        Create your savings circle, keep every contribution in view, and know
        exactly whose turn is next.
      </p>
      <form
        className="card-soft mt-8 space-y-5 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const identity = await create.mutateAsync({
              path: "/session",
              body: { display_name: name.trim() },
            });
            client.removeQueries({ queryKey: ["savings"] });
            client.setQueryData(["savings-session"], identity);
          } catch {
            /* shown below */
          }
        }}
      >
        <label className="block text-sm font-medium" htmlFor="savings-name">
          What should your circle call you?
          <input
            id="savings-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            placeholder="Your name"
          />
        </label>
        <ErrorNotice error={create.error} />
        <button
          className="btn-primary w-full"
          disabled={create.isPending || name.trim().length < 2}
        >
          {create.isPending ? "Getting ready…" : "Start saving together"}
          <ArrowRight className="h-4 w-4" />
        </button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          This MVP remembers your identity in this browser for up to 30 days. It
          tracks payments made outside Ajora and does not hold or transfer
          money. Clearing browser cookies loses access to this identity.
        </p>
      </form>
    </div>
  );
}
export function TrackingNote() {
  return (
    <div className="mt-6 flex items-start gap-3 rounded-xl border border-border p-4 text-xs leading-relaxed text-muted-foreground">
      <ShieldCheck className="h-5 w-5 shrink-0 text-accent" aria-hidden />
      <p>
        Ajora tracks your circle’s records. Send money through your agreed
        payment method, then submit a reference here. Only organiser-confirmed
        contributions count as received.
      </p>
    </div>
  );
}
export function CircleCard({ circle }: { circle: Circle }) {
  const confirmed = circle.contributions.filter(
    (c) => c.round_number === circle.current_round && c.status === "confirmed",
  ).length;
  return (
    <Link
      href={`/circles/${circle.id}`}
      className="card-soft card-hover flex flex-col gap-5 border border-border p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <UsersThree className="h-6 w-6" aria-hidden />
        </span>
        <span
          className={circle.status === "active" ? "badge" : "badge-neutral"}
        >
          {circle.status === "draft"
            ? "Gathering members"
            : circle.status === "active"
              ? `Round ${circle.current_round} of ${circle.member_limit}`
              : "Completed"}
        </span>
      </div>
      <div>
        <h2 className="text-lg font-semibold">{circle.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {money(circle.contribution_kobo)} per member · {circle.frequency}
        </p>
      </div>
      <div className="mt-auto border-t border-border pt-4">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {circle.members.length}/{circle.member_limit} members
          </span>
          <span>
            {circle.status === "active"
              ? `${confirmed}/${circle.members.length} paid this round`
              : circle.status === "draft"
                ? "Waiting to start"
                : `${circle.payouts.length} payouts recorded`}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-accent"
            style={{
              width: `${100 * (circle.status === "active" ? confirmed / circle.member_limit : circle.status === "completed" ? 1 : circle.members.length / circle.member_limit)}%`,
            }}
          />
        </div>
      </div>
    </Link>
  );
}
export function EmptyCircles() {
  return (
    <div className="card-soft border border-dashed border-border p-10 text-center">
      <UsersThree className="mx-auto h-10 w-10 text-accent" aria-hidden />
      <h2 className="mt-4 text-xl font-semibold">
        Your first circle starts here
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Bring your people together around a regular contribution and an agreed
        payout order.
      </p>
      <Link href="/circles" className="btn-primary mt-6">
        Create or join a circle
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

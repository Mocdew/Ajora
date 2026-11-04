"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  UsersThree,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import { EngineError, enginePost } from "@/lib/api/engine";
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
  const [recoveryKey, setRecoveryKey] = useState("");
  const recover = useMutation({
    mutationFn: () =>
      enginePost<SavingsSession>("/savings/recover", {
        recovery_key: recoveryKey.trim(),
      }),
    onSuccess: (identity) => {
      setRecoveryKey("");
      client.removeQueries({ queryKey: ["savings"] });
      client.setQueryData(["savings-session"], identity);
    },
  });
  if (session.isPending) return <Loading />;
  const unauthorized =
    session.error instanceof EngineError && session.error.status === 401;
  if (session.data && !unauthorized)
    return (
      <>
        <AccountAccess session={session.data} />
        {children(session.data)}
      </>
    );
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
          After creating your profile, save a private recovery key under Account
          access. Use it to return on another device or after your session
          expires. Ajora tracks external payments and does not hold or transfer
          money.
        </p>
      </form>
      <form
        className="card-soft mt-5 space-y-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          recover.mutate();
        }}
      >
        <h2 className="text-lg font-semibold">Return to your circles</h2>
        <label className="block text-sm font-medium">
          Recovery key
          <input
            className={inputClass}
            type="password"
            value={recoveryKey}
            onChange={(event) => setRecoveryKey(event.target.value)}
            required
            autoComplete="off"
            spellCheck={false}
            maxLength={200}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Restoring access signs out your other sessions.
        </p>
        <ErrorNotice error={recover.error} />
        <button
          className="btn-secondary"
          disabled={recover.isPending || !recoveryKey.trim()}
        >
          Restore my profile
        </button>
      </form>
    </div>
  );
}
function AccountAccess({ session }: { session: SavingsSession }) {
  const client = useQueryClient();
  const [key, setKey] = useState("");
  const recovery = useMutation({
    mutationFn: () =>
      enginePost<{ recovery_key: string }>("/savings/recovery-key", {}),
    onSuccess: (data) => setKey(data.recovery_key),
  });
  const logout = useMutation({
    mutationFn: () => enginePost("/savings/logout", {}),
    onSuccess: () => {
      client.removeQueries({ queryKey: ["savings"] });
      void client.resetQueries({ queryKey: ["savings-session"] });
    },
  });
  return (
    <div className="mb-6">
      <p className="mb-2 text-xs text-muted-foreground">
        Save a private recovery key under Account access to keep access across
        devices and expired sessions.
      </p>
      <details className="card-soft p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Account access · {session.display_name} · Save your recovery key
        </summary>
        <div className="mt-4 space-y-4">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Save a recovery key now so you can return to these circles on
            another device. Anyone with the key can access your profile.
            Replacing it invalidates the previous key.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-secondary"
              disabled={recovery.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Create a new recovery key? Any previous key will stop working. Save the new key privately before leaving this page.",
                  )
                )
                  recovery.mutate();
              }}
            >
              Create or replace recovery key
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={logout.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Sign out? Make sure you have saved your recovery key so you can return to your circles.",
                  )
                )
                  logout.mutate();
              }}
            >
              Sign out
            </button>
          </div>
          <ErrorNotice error={recovery.error ?? logout.error} />
          {key && (
            <div className="panel-inset space-y-3 p-4" role="status">
              <label className="block text-sm font-medium">
                Your new recovery key
                <input
                  className={`${inputClass} font-mono`}
                  value={key}
                  readOnly
                  autoComplete="off"
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Shown only here. Copy it to a password manager or another
                private place. Ajora cannot show it again.
              </p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setKey("");
                  recovery.reset();
                }}
              >
                I saved my key
              </button>
            </div>
          )}
        </div>
      </details>
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
        amounts count toward the recorded collection. Demo matches are simulated
        evidence and do not verify real payments. Payout receipt is confirmed by
        the recipient.
      </p>
    </div>
  );
}
export function CircleCard({ circle }: { circle: Circle }) {
  const confirmed = circle.contributions
    .filter((c) => c.round_number === circle.current_round)
    .reduce((sum, c) => sum + c.confirmed_kobo, 0);
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
              ? `${money(confirmed)} confirmed this round`
              : circle.status === "draft"
                ? "Waiting to start"
                : `${circle.payouts.length} payouts recorded`}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-accent"
            style={{
              width: `${100 * (circle.status === "active" ? confirmed / (circle.contribution_kobo * circle.member_limit) : circle.status === "completed" ? 1 : circle.members.length / circle.member_limit)}%`,
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

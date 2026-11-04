"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  UsersThree,
  ShieldCheck,
  ArrowUpRight,
  Fingerprint,
} from "@phosphor-icons/react/dist/ssr";
import { EngineError, enginePost } from "@/lib/api/engine";
import {
  useSavingsSession,
  type SavingsSession,
  type Circle,
} from "@/lib/api/savings";
import { formatNaira } from "@/lib/utils";
import { CircleMotif } from "./circle-motif";
import { GoogleSignIn } from "./google-sign-in";
import { EmailVerificationStatus } from "./account-email";

export const inputClass =
  "mt-2 w-full rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground/70 hover:border-foreground/30";
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

async function replaceSavingsSession(
  client: QueryClient,
  identity: SavingsSession | null,
) {
  await Promise.all([
    client.cancelQueries({ queryKey: ["savings"] }),
    client.cancelQueries({ queryKey: ["savings-session"] }),
    client.cancelQueries({ queryKey: ["account-email"] }),
  ]);
  client.removeQueries({ queryKey: ["savings"] });
  client.removeQueries({ queryKey: ["account-email"] });
  if (identity) client.setQueryData(["savings-session"], identity);
  else await client.resetQueries({ queryKey: ["savings-session"] });
}

function AuthenticationForm({ guest }: { guest?: SavingsSession }) {
  const client = useQueryClient();
  const id = useId();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [name, setName] = useState(guest?.display_name ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  useEffect(() => {
    if (!guest && new URLSearchParams(window.location.search).get("login") === "1") setMode("login");
  }, [guest]);
  const registering = mode === "register";
  const mismatch = registering && password !== confirmation;
  const auth = useMutation({
    mutationFn: () =>
      enginePost<SavingsSession>(`/auth/${mode}`, {
        ...(registering ? { display_name: name.trim() } : {}),
        email: email.trim(),
        password,
      }),
    onSuccess: async (identity) => {
      setPassword("");
      setConfirmation("");
      await replaceSavingsSession(client, identity);
    },
  });
  const pending = auth.isPending || googlePending;

  return (
    <div
      className={guest ? "space-y-5" : "onboarding-form card-soft space-y-5 p-6 sm:p-8"}
    >
      {!guest && (
        <div className="flex gap-1 rounded-lg border border-border bg-secondary/40 p-1" aria-label="Account access options">
          {(["register", "login"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${mode === option ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              aria-pressed={mode === option}
              disabled={pending}
              onClick={() => {
                setMode(option);
                setPassword("");
                setConfirmation("");
                setShowPassword(false);
                setSubmitted(false);
                auth.reset();
              }}
            >
              {option === "register" ? "Create account" : "Log in"}
            </button>
          ))}
        </div>
      )}
      <GoogleSignIn
        disabled={pending}
        onPendingChange={setGooglePending}
        onSuccess={async (identity) => {
          setPassword("");
          setConfirmation("");
          await replaceSavingsSession(client, identity);
        }}
      />
      <form
        className="space-y-5"
        aria-label={guest ? "Upgrade your profile" : registering ? "Create account" : "Log in"}
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (!mismatch && !pending) auth.mutate();
        }}
      >
      <div className="border-b border-border pb-5">
        <div className="mb-5 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{guest ? "Keep your circles" : registering ? "Get started" : "Welcome back"}</span>
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary/60"><Fingerprint className="h-5 w-5" aria-hidden /></span>
        </div>
        <h2 className="text-2xl font-medium tracking-tight">{guest ? "Add a login to your profile." : registering ? "Make room for your goals." : "Return to your circles."}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{guest ? "Keep your existing circles and history. Your old recovery key will stop working once you create your account." : registering ? "Create an account to save with your people and return on any device." : "Use the same sign-in method you used to create your account."}</p>
      </div>
      {registering && (
        <label className="block text-sm font-medium" htmlFor={`${id}-name`}>
          What should your circle call you?
          <input
            id={`${id}-name`}
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            readOnly={Boolean(guest)}
            minLength={2}
            maxLength={80}
            autoComplete="name"
            placeholder="Your name"
            disabled={pending}
          />
        </label>
      )}
      <label className="block text-sm font-medium" htmlFor={`${id}-email`}>
        Email address
        <input
          id={`${id}-email`}
          className={inputClass}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          maxLength={254}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          disabled={pending}
        />
      </label>
      <label className="block text-sm font-medium" htmlFor={`${id}-password`}>
        Password
        <input
          id={`${id}-password`}
          className={inputClass}
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={registering ? 15 : undefined}
          maxLength={128}
          autoComplete={registering ? "new-password" : "current-password"}
          aria-describedby={registering ? `${id}-password-hint` : undefined}
          disabled={pending}
        />
      </label>
      {registering && <p id={`${id}-password-hint`} className="!mt-2 text-xs leading-5 text-muted-foreground">Use 15–128 characters. A few memorable words work well.</p>}
      {registering && (
        <label className="block text-sm font-medium" htmlFor={`${id}-confirmation`}>
          Confirm password
          <input
            id={`${id}-confirmation`}
            className={inputClass}
            type={showPassword ? "text" : "password"}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            maxLength={128}
            autoComplete="new-password"
            aria-invalid={submitted && mismatch || undefined}
            aria-describedby={submitted && mismatch ? `${id}-mismatch` : undefined}
            disabled={pending}
          />
        </label>
      )}
      <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
        Show password
      </label>
      {submitted && mismatch && <p id={`${id}-mismatch`} className="text-sm text-negative" role="alert">Your passwords do not match.</p>}
      <ErrorNotice error={auth.error} />
      <button
        type="submit"
        className="btn-primary w-full"
        disabled={pending}
      >
        {auth.isPending ? registering ? "Creating account…" : "Signing in…" : registering ? "Create account" : "Log in"}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
      {!registering && <Link href="/forgot-password" className="block text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">Forgot password?</Link>}
      {!guest && <p className="text-xs leading-relaxed text-muted-foreground">Ajora tracks external payments and does not hold or transfer money.</p>}
      </form>
    </div>
  );
}

export function SavingsGate({
  children,
}: {
  children: (session: SavingsSession) => ReactNode;
}) {
  const session = useSavingsSession();
  const client = useQueryClient();
  const [recoveryKey, setRecoveryKey] = useState("");
  const recover = useMutation({
    mutationFn: () =>
      enginePost<SavingsSession>("/savings/recover", {
        recovery_key: recoveryKey.trim(),
      }),
    onSuccess: async (identity) => {
      setRecoveryKey("");
      await replaceSavingsSession(client, identity);
    },
  });
  if (session.isPending) return <Loading />;
  if (session.data)
    return (
      <>
        <AccountAccess key={`${session.data.user_id}:${session.data.email ?? ""}`} session={session.data} />
        {children(session.data)}
      </>
    );
  if (session.error && session.data === undefined)
    return (
      <ErrorNotice error={session.error} retry={() => session.refetch()} />
    );
  return (
    <div className="py-2 md:py-5">
      <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] xl:gap-16">
        <div className="pt-2 xl:pt-4">
          <span className="eyebrow">Ajo, together</span>
          <h1 className="mt-6 text-[2.5rem] font-normal leading-[1.12] tracking-[-0.055em] sm:text-5xl lg:text-[2.75rem] xl:text-[3rem] 2xl:text-[3.25rem]">
            Small contributions.
            <br />
            <span className="font-editorial tracking-[-0.045em]">
              Shared possibilities.
            </span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">
            Create your savings circle, keep every contribution in view, and know
            exactly whose turn is next.
          </p>
          <div className="onboarding-visual relative mt-8 hidden h-[320px] max-w-lg items-center justify-center overflow-hidden rounded-2xl border border-border sm:flex" aria-hidden="true">
            <span className="absolute left-5 top-5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Built around your people</span>
            <span className="absolute right-5 top-5 h-1.5 w-1.5 rounded-full bg-foreground/25" />
            <CircleMotif className="onboarding-center h-full w-full max-w-[440px] text-foreground" />
            <span className="absolute bottom-5 left-5 text-xs text-muted-foreground">Your people. <span className="text-foreground">One circle.</span></span>
            <ArrowUpRight className="absolute bottom-5 right-5 h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        <div className="min-w-0">
          <AuthenticationForm />
          <details className="mt-6 rounded-xl border border-border px-4 py-3">
            <summary className="cursor-pointer text-sm text-muted-foreground">Recover an existing profile</summary>
          <form
            className="mt-7 space-y-4 px-1 sm:px-2"
            onSubmit={(event) => {
              event.preventDefault();
              recover.mutate();
            }}
          >
            <h2 className="text-base font-medium">Return to your circles</h2>
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
          </details>
        </div>
      </div>
      <div className="mt-12 grid gap-6 border-t border-border pt-8 sm:grid-cols-3 xl:mt-14">
        {[
          ["01", "Bring your people", "Create a circle or join with an invite code."],
          ["02", "Keep the record clear", "Track contributions made through your usual channels."],
          ["03", "Know your next turn", "Agree your payout order and follow every round."],
        ].map(([step, title, description]) => (
          <div key={step} className="onboarding-step flex items-start gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card font-mono text-[10px] text-muted-foreground">{step}</span>
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function AccountAccess({ session }: { session: SavingsSession }) {
  const client = useQueryClient();
  const [key, setKey] = useState("");
  const [googlePending, setGooglePending] = useState(false);
  const recovery = useMutation({
    mutationFn: () =>
      enginePost<{ recovery_key: string }>("/savings/recovery-key", {}),
    onSuccess: (data) => setKey(data.recovery_key),
  });
  const logout = useMutation({
    mutationFn: async () => {
      try {
        await enginePost("/savings/logout", {});
      } catch (error) {
        if (!(error instanceof EngineError && error.status === 401)) throw error;
      }
    },
    onSuccess: () => replaceSavingsSession(client, null),
  });
  return (
    <div className="mb-7">
      <details className="account-access rounded-xl border border-border bg-card px-4 py-3">
        <summary className="cursor-pointer text-xs leading-5 text-muted-foreground transition-colors hover:text-foreground">
          Account access · {session.display_name}{session.email ? "" : " · Add a login"}
        </summary>
        <div className="mt-4 space-y-4">
          {session.email ? (
            <div className="space-y-3">
              <p className="break-all text-sm text-muted-foreground">Signed in as {session.email}</p>
              {session.google_linked ? <p className="text-xs text-muted-foreground">Google is connected to your account.</p> : <>
                {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() && <p className="text-xs text-muted-foreground">Connect Google using this email to sign in to your existing account.</p>}
                <GoogleSignIn disabled={logout.isPending} onPendingChange={setGooglePending} onSuccess={(identity) => replaceSavingsSession(client, identity)} />
              </>}
            </div>
          ) : (
            <>
              <AuthenticationForm guest={session} />
              <p className="max-w-2xl border-t border-border pt-4 text-sm text-muted-foreground">
                Until you add a login, save a private recovery key to return on another device.
                Anyone with the key can access your profile. Replacing it invalidates the previous key.
              </p>
            </>
          )}
          <div className="flex flex-wrap gap-3">
            {!session.email && <button
              type="button"
              className="btn-secondary"
              disabled={recovery.isPending || googlePending}
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
            </button>}
            <button
              type="button"
              className="btn-secondary"
              disabled={logout.isPending || googlePending}
              onClick={() => {
                if (session.email ||
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
          {!session.email && key && (
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
      {session.email && <EmailVerificationStatus key={session.user_id} userId={session.user_id} />}
    </div>
  );
}
export function TrackingNote() {
  return (
    <div className="mt-8 flex items-start gap-3 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
      <ShieldCheck className="h-5 w-5 shrink-0 text-foreground/60" aria-hidden />
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
      className="circle-card card-soft card-hover group relative flex flex-col gap-6 overflow-hidden p-6 sm:p-7"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="circle-avatar relative flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-secondary/50 text-foreground">
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
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-medium tracking-tight">{circle.name}</h2>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden />
        </div>
        <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="font-mono text-2xl font-normal tracking-tighter">{money(circle.contribution_kobo)}</p>
          <p className="text-xs text-muted-foreground">per member · {circle.frequency}</p>
        </div>
      </div>
      <div className="mt-auto border-t border-border pt-4">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
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
        <div className="circle-progress mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-foreground"
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
    <div className="savings-empty card-soft relative flex flex-col items-center overflow-hidden px-6 py-12 text-center sm:py-14">
      <div className="pointer-events-none absolute -top-20 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full border border-border/50" aria-hidden />
      <div className="pointer-events-none absolute -top-12 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full border border-border/50" aria-hidden />
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card shadow-sm">
        <UsersThree className="h-6 w-6 text-foreground" aria-hidden />
      </span>
      <h2 className="mt-5 text-2xl font-medium tracking-tight">
        Your first circle starts here
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
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

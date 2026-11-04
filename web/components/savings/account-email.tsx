"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle, EnvelopeSimple } from "@phosphor-icons/react/dist/ssr";
import {
  accountEmailKey,
  getAccountEmailStatus,
  requestEmailVerification,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from "@/lib/api/account-email";

const inputClass = "mt-2 w-full rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground/70 hover:border-foreground/30";
const loginPath = "/dashboard?login=1";

function RequestError({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="rounded-lg bg-negative/10 p-3 text-sm text-negative">{error instanceof Error ? error.message : "Something went wrong. Please try again."}</p>;
}

function EmailPage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-5 py-10 sm:px-8">
      <Link href="/dashboard" className="mb-8 w-fit text-xl font-medium tracking-tight">Ajora<span className="text-muted-foreground">.</span></Link>
      <section className="card-soft space-y-6 p-6 sm:p-8" aria-labelledby="account-email-title">
        <div className="border-b border-border pb-5">
          <span className="mb-5 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary/60"><EnvelopeSimple className="h-5 w-5" aria-hidden /></span>
          <h1 id="account-email-title" className="text-2xl font-medium tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {children}
      </section>
      <Link href={loginPath} className="mt-6 flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden /> Back to log in</Link>
    </main>
  );
}

export function ForgotPasswordPage() {
  const id = useId();
  const [email, setEmail] = useState("");
  const request = useMutation({ mutationFn: () => requestPasswordReset(email) });
  return (
    <EmailPage title="Reset your password." description="Enter the email you use for Ajora. We’ll send a link if it belongs to a password account.">
      <form className="space-y-5" aria-label="Request password reset" onSubmit={(event) => {
        event.preventDefault();
        if (!request.isPending) request.mutate();
      }}>
        <label htmlFor={`${id}-email`} className="block text-sm font-medium">Email address
          <input id={`${id}-email`} type="email" className={inputClass} required maxLength={254} autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={email} disabled={request.isPending} onChange={(event) => { setEmail(event.target.value); request.reset(); }} />
        </label>
        <RequestError error={request.error} />
        {request.isSuccess && <p role="status" className="rounded-lg bg-secondary p-4 text-sm leading-6">{request.data.message} Check your inbox and spam folder. The link expires after 30 minutes.</p>}
        <button type="submit" className="btn-primary w-full" disabled={request.isPending}>{request.isPending ? "Requesting link…" : request.isSuccess ? "Request another link" : "Send reset link"}<ArrowRight className="h-4 w-4" aria-hidden /></button>
      </form>
    </EmailPage>
  );
}

// Fragments stay out of HTTP requests. Remove the secret from the address bar
// after reading it once; submitting the form is the only action that consumes it.
function useEmailToken() {
  const [token, setToken] = useState<string | null>(null);
  const read = useRef(false);
  useEffect(() => {
    if (read.current) return;
    read.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    window.history.replaceState(window.history.state, "", window.location.pathname);
    setToken(value);
  }, []);
  return token;
}

export function ResetPasswordPage() {
  const token = useEmailToken();
  const id = useId();
  const client = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const mismatch = submitted && password !== confirmation;
  const reset = useMutation({
    mutationFn: () => resetPassword(token ?? "", password),
    onSuccess: async () => {
      setPassword("");
      setConfirmation("");
      await Promise.all([
        client.cancelQueries({ queryKey: ["savings"] }),
        client.cancelQueries({ queryKey: ["savings-session"] }),
        client.cancelQueries({ queryKey: ["account-email"] }),
      ]);
      client.removeQueries({ queryKey: ["savings"] });
      client.removeQueries({ queryKey: ["account-email"] });
      client.setQueryData(["savings-session"], null);
    },
  });
  return (
    <EmailPage title="Choose a new password." description="Your circles and contribution history stay connected to your account.">
      {token === null ? <p role="status" className="text-sm text-muted-foreground">Opening your secure link…</p> : reset.isSuccess ? (
        <div className="space-y-5">
          <p role="status" className="rounded-lg bg-secondary p-4 text-sm leading-6">Your password has been reset and all previous sessions have been signed out. Log in with your new password to return to your circles.</p>
          <Link href={loginPath} className="btn-primary w-full">Log in<ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
      ) : !token ? <p role="alert" className="text-sm leading-6 text-muted-foreground">This reset link is missing its code. <Link href="/forgot-password" className="underline underline-offset-4">Request a new reset link</Link>.</p> : (
        <form className="space-y-5" aria-label="Reset password" onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (password === confirmation && !reset.isPending) reset.mutate();
        }}>
          <label htmlFor={`${id}-password`} className="block text-sm font-medium">New password
            <input id={`${id}-password`} type={showPassword ? "text" : "password"} className={inputClass} required minLength={15} maxLength={128} autoComplete="new-password" aria-describedby={`${id}-password-hint`} value={password} disabled={reset.isPending} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <p id={`${id}-password-hint`} className="!mt-2 text-xs leading-5 text-muted-foreground">Use 15–128 characters. A few memorable words work well.</p>
          <label htmlFor={`${id}-confirmation`} className="block text-sm font-medium">Confirm new password
            <input id={`${id}-confirmation`} type={showPassword ? "text" : "password"} className={inputClass} required maxLength={128} autoComplete="new-password" aria-invalid={mismatch || undefined} aria-describedby={mismatch ? `${id}-mismatch` : undefined} value={confirmation} disabled={reset.isPending} onChange={(event) => setConfirmation(event.target.value)} />
          </label>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showPassword} disabled={reset.isPending} onChange={(event) => setShowPassword(event.target.checked)} /> Show password</label>
          {mismatch && <p id={`${id}-mismatch`} role="alert" className="text-sm text-negative">Your passwords do not match.</p>}
          <RequestError error={reset.error} />
          {reset.isError && <Link href="/forgot-password" className="block text-sm underline underline-offset-4">Request a new reset link</Link>}
          <button type="submit" className="btn-primary w-full" disabled={reset.isPending}>{reset.isPending ? "Resetting password…" : "Reset password"}<ArrowRight className="h-4 w-4" aria-hidden /></button>
        </form>
      )}
    </EmailPage>
  );
}

export function VerifyEmailPage() {
  const token = useEmailToken();
  const client = useQueryClient();
  const verify = useMutation({
    mutationFn: () => verifyEmail(token ?? ""),
    onSuccess: () => client.invalidateQueries({ queryKey: ["account-email"] }),
  });
  return (
    <EmailPage title="Verify your email." description="Confirm this email address belongs to you so you can recover access to your Ajora account.">
      {token === null ? <p role="status" className="text-sm text-muted-foreground">Opening your secure link…</p> : verify.isSuccess ? (
        <div className="space-y-5">
          <p role="status" className="rounded-lg bg-secondary p-4 text-sm leading-6">Your email address is verified. Return to Ajora to continue.</p>
          <Link href="/dashboard" className="btn-primary w-full">Return to Ajora<ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
      ) : !token ? <p role="alert" className="text-sm leading-6 text-muted-foreground">This verification link is missing its code. <Link href="/dashboard" className="underline underline-offset-4">Open Account access in Ajora</Link> to request a new email.</p> : (
        <form className="space-y-5" aria-label="Verify email" onSubmit={(event) => {
          event.preventDefault();
          if (!verify.isPending) verify.mutate();
        }}>
          <p className="text-sm leading-6 text-muted-foreground">Select the button below to confirm your email address. Verification does not change your circle memberships.</p>
          <RequestError error={verify.error} />
          {verify.isError && <Link href="/dashboard" className="block text-sm underline underline-offset-4">Open Account access to request a new email</Link>}
          <button type="submit" className="btn-primary w-full" disabled={verify.isPending}>{verify.isPending ? "Verifying email…" : "Verify email address"}<ArrowRight className="h-4 w-4" aria-hidden /></button>
        </form>
      )}
    </EmailPage>
  );
}

export function EmailVerificationStatus({ userId }: { userId: string }) {
  const status = useQuery({
    queryKey: accountEmailKey(userId),
    queryFn: ({ signal }) => getAccountEmailStatus(signal),
    retry: false,
    refetchOnWindowFocus: true,
  });
  const request = useMutation({ mutationFn: requestEmailVerification });
  if (status.isPending) return <p role="status" className="mt-3 text-xs text-muted-foreground">Checking email verification…</p>;
  if (status.isError) return <div className="mt-3 space-y-3"><RequestError error={status.error} /><button type="button" className="btn-secondary" onClick={() => status.refetch()}>Check email status again</button></div>;
  if (!status.data.email) return null;
  if (status.data.verified) return <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle className="h-4 w-4" aria-hidden /> Email verified</p>;
  return (
    <section className="mt-3 space-y-3 rounded-xl border border-border bg-card px-4 py-4" aria-label="Email verification">
      <p className="text-sm font-medium">Verify your email address</p>
      <p className="break-words text-xs leading-5 text-muted-foreground">Confirm {status.data.email} belongs to you. Your circle access stays available while you verify.</p>
      {status.data.delivery_available ? <button type="button" className="btn-secondary" disabled={request.isPending} onClick={() => request.mutate()}>{request.isPending ? "Requesting email…" : request.isSuccess ? "Send another verification email" : "Send verification email"}</button> : <p className="text-xs leading-5 text-muted-foreground">Email verification is temporarily unavailable. Please try again later.</p>}
      {request.isSuccess && <p role="status" className="text-sm leading-6">{request.data.message} Check your inbox and spam folder. The link expires after 24 hours.</p>}
      <RequestError error={request.error} />
    </section>
  );
}

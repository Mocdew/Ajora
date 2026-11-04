"use client";

import { useEffect, useRef, useState } from "react";
import { enginePost } from "@/lib/api/engine";
import type { SavingsSession } from "@/lib/api/savings";

type GoogleIdentity = {
  initialize: (options: {
    client_id: string;
    nonce: string;
    ux_mode: "popup";
    auto_select: false;
    callback: (response: { credential: string }) => void;
  }) => void;
  renderButton: (element: HTMLElement, options: {
    type: "standard";
    theme: "outline";
    size: "large";
    text: "continue_with";
    width: number;
  }) => void;
};

const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
let identityScript: Promise<GoogleIdentity> | undefined;

function loadGoogleIdentity(): Promise<GoogleIdentity> {
  const identity = (window as Window & { google?: { accounts?: { id?: GoogleIdentity } } }).google?.accounts?.id;
  if (identity) return Promise.resolve(identity);
  if (identityScript) return identityScript;
  identityScript = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      identityScript = undefined;
      reject(new Error("Google sign-in could not load. Check your connection and try again."));
    };
    const timeout = setTimeout(fail, 15_000);
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onerror = fail;
    script.onload = () => {
      clearTimeout(timeout);
      const loaded = (window as Window & { google?: { accounts?: { id?: GoogleIdentity } } }).google?.accounts?.id;
      if (loaded) resolve(loaded);
      else fail();
    };
    document.head.appendChild(script);
  });
  return identityScript;
}

type Props = {
  disabled?: boolean;
  onSuccess: (session: SavingsSession) => Promise<void>;
  onPendingChange: (pending: boolean) => void;
};

export function GoogleSignIn(props: Props) {
  if (!clientId) return null;
  return <ConfiguredGoogleSignIn {...props} />;
}

function ConfiguredGoogleSignIn({ disabled = false, onSuccess, onPendingChange }: Props) {
  const button = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ disabled, onSuccess, onPendingChange });
  const submitting = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    callbacks.current = { disabled, onSuccess, onPendingChange };
  }, [disabled, onSuccess, onPendingChange]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const element = button.current;
    async function prepare() {
      try {
        const google = await loadGoogleIdentity();
        if (!active || !element) return;
        const challenge = await enginePost<{ client_id: string; nonce: string }>(
          "/auth/google/challenge", {}, controller.signal,
        );
        if (!active) return;
        if (challenge.client_id !== clientId) {
          throw new Error("Google sign-in is unavailable. Please use email and password.");
        }
        google.initialize({
          client_id: challenge.client_id,
          nonce: challenge.nonce,
          ux_mode: "popup",
          auto_select: false,
          callback: async ({ credential }) => {
            if (!active || submitting.current || callbacks.current.disabled) return;
            submitting.current = true;
            setPending(true);
            setError(null);
            callbacks.current.onPendingChange(true);
            try {
              const session = await enginePost<SavingsSession>("/auth/google", { credential }, controller.signal);
              if (active) await callbacks.current.onSuccess(session);
            } catch (failure) {
              if (active) {
                setError(failure instanceof Error ? failure : new Error("Google sign-in failed. Please try again."));
                setReady(false);
                setAttempt((value) => value + 1);
              }
            } finally {
              submitting.current = false;
              if (active) {
                setPending(false);
                callbacks.current.onPendingChange(false);
              }
            }
          },
        });
        google.renderButton(element, {
          type: "standard", theme: "outline", size: "large", text: "continue_with",
          width: Math.min(400, Math.max(200, element.clientWidth)),
        });
        setReady(true);
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure : new Error("Google sign-in is unavailable."));
      }
    }
    void prepare();
    return () => {
      active = false;
      controller.abort();
      element?.replaceChildren();
      callbacks.current.onPendingChange(false);
    };
  }, [attempt]);

  return (
    <div className="space-y-3">
      <div className="relative min-h-11">
        <div ref={button} inert={disabled || pending} className={disabled || pending ? "pointer-events-none opacity-60" : ""} />
        {!ready && !error && <p className="absolute inset-0 flex items-center text-xs text-muted-foreground" role="status">Loading Google sign-in…</p>}
      </div>
      {pending && <p className="text-sm text-muted-foreground" role="status">Signing in with Google…</p>}
      {error && <div className="space-y-2 text-sm text-negative" role="alert">
        <p>{error.message}</p>
        {!ready && <button type="button" className="btn-secondary" disabled={disabled || pending} onClick={() => {
          setError(null);
          setAttempt((value) => value + 1);
        }}>Retry Google sign-in</button>}
      </div>}
    </div>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { EngineError, engineGet, enginePost } from "./engine";

import type { components } from "./engine-schema";

export type SavingsSession = components["schemas"]["Session"];
export type CircleMember = components["schemas"]["Member"];
export type Circle = components["schemas"]["Circle"];
export type InvitationPreview = components["schemas"]["InvitationPreview"];

const sessionKey = ["savings-session"];
const writeTimeout = 45_000;

async function clearAccountQueries(client: QueryClient) {
  await Promise.all([
    client.cancelQueries({ queryKey: ["savings"] }),
    client.cancelQueries({ queryKey: ["account-email"] }),
  ]);
  client.removeQueries({ queryKey: ["savings"] });
  client.removeQueries({ queryKey: ["account-email"] });
}

export async function replaceSavingsSession(
  client: QueryClient,
  identity: SavingsSession | null,
) {
  await client.cancelQueries({ queryKey: sessionKey });
  client.setQueryData(sessionKey, identity);
  await clearAccountQueries(client);
}

export function useSavingsLogout(userId?: string, onSignedOut?: () => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await enginePost("/savings/logout", {}, undefined, userId ? actorHeader(userId) : undefined);
      } catch (error) {
        if (!(error instanceof EngineError && error.status === 401)) throw error;
      }
    },
    onSuccess: () => {
      onSignedOut?.();
      return replaceSavingsSession(client, null);
    },
    onError: (error) => {
      if (isSavingsAccessError(error)) void client.invalidateQueries({ queryKey: sessionKey });
    },
  });
}

export function useSavingsSession() {
  const client = useQueryClient();
  return useQuery({
    queryKey: sessionKey,
    queryFn: async ({ signal }) => {
      let identity: SavingsSession | null;
      try {
        identity = await engineGet<SavingsSession>("/savings/session", signal);
      } catch (error) {
        if (!(error instanceof EngineError && error.status === 401)) throw error;
        identity = null;
      }
      const previous = client.getQueryData<SavingsSession | null>(sessionKey);
      if (!signal.aborted && previous && previous.user_id !== identity?.user_id) {
        await clearAccountQueries(client);
      }
      return identity;
    },
    retry: false,
    refetchInterval: 10_000,
    refetchOnWindowFocus: "always",
  });
}

export function actorHeader(userId: string) {
  return { "X-Ajora-Actor": userId };
}

export function isSavingsAccessError(error: unknown) {
  return error instanceof EngineError && [401, 403, 409].includes(error.status);
}

async function readSavings<T>(client: QueryClient, userId: string, path: string, signal?: AbortSignal) {
  try {
    return await engineGet<T>(`/savings${path}`, signal, actorHeader(userId));
  } catch (error) {
    if (isSavingsAccessError(error)) void client.invalidateQueries({ queryKey: sessionKey });
    throw error;
  }
}

export function useCircles(userId: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: ["savings", userId, "circles"],
    queryFn: ({ signal }) => readSavings<Circle[]>(client, userId, "/circles", signal),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}
export function useCircle(userId: string, id: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: ["savings", userId, "circles", id],
    queryFn: ({ signal }) =>
      readSavings<Circle>(client, userId, `/circles/${encodeURIComponent(id)}`, signal),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

function subscribeToConnection(update: () => void) {
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
}

export function useSavingsOnline() {
  return useSyncExternalStore(subscribeToConnection, () => navigator.onLine, () => true);
}

type Write = { path: string; body?: unknown; onCommitted?: (circle: Circle) => void };
type Operation = Write & { key: string };
type PendingOperation = Pick<Operation, "key" | "path">;
type PendingWrite = { operation: Operation; restored?: boolean };

function loadPendingOperation(storageKey: string): PendingOperation | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    return typeof value?.key === "string" && typeof value?.path === "string" ? value : null;
  } catch {
    return null;
  }
}

function rememberPendingOperation(storageKey: string, operation: PendingOperation | null) {
  try {
    if (operation) sessionStorage.setItem(storageKey, JSON.stringify({ key: operation.key, path: operation.path }));
    else sessionStorage.removeItem(storageKey);
  } catch {
    // Keep the active page usable when browser storage is unavailable.
  }
}

function unknownOutcome(error: unknown) {
  return error instanceof EngineError && (error.status === 0 || error.status >= 500 ||
    (error.status >= 200 && error.status < 300));
}

class OutcomeCheckError extends Error {
  constructor() {
    super("Ajora couldn’t check the last change. Refresh and try again.");
    this.name = "OutcomeCheckError";
  }
}

export function useSavingsAction(userId: string, scope: string, onRecovered?: (circle: Circle) => void) {
  const client = useQueryClient();
  const active = useRef(false);
  const [pending, setPending] = useState<PendingWrite | null>(null);
  const [retryOriginal, setRetryOriginal] = useState(false);
  const [pathError, setPathError] = useState<Error | null>(null);
  const storageKey = `ajora:pending-savings:${userId}:${scope}`;
  useEffect(() => {
    const operation = loadPendingOperation(storageKey);
    setPending(operation ? { operation, restored: true } : null);
  }, [storageKey]);

  const action = useMutation({
    networkMode: "always",
    gcTime: 0,
    mutationFn: async ({ operation, checking, readOnly, abandoning }: {
      operation: Operation;
      checking: boolean;
      readOnly: boolean;
      abandoning: boolean;
    }) => {
      if (!navigator.onLine) {
        throw new Error(checking
          ? "Reconnect to check this request."
          : "You’re offline. This request was not sent.");
      }
      const headers = { ...actorHeader(userId), "Idempotency-Key": operation.key };
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), writeTimeout);
      try {
        if (abandoning) {
          return await enginePost<Circle | null>(`/savings/operations/${operation.key}/abandon`, {}, controller.signal, actorHeader(userId));
        }
        if (checking) {
          try {
            return await readSavings<Circle>(client, userId, `/operations/${operation.key}`, controller.signal);
          } catch (error) {
            if (!(error instanceof EngineError && error.status === 404)) throw new OutcomeCheckError();
          }
          const resource = operation.path.match(/^\/circles\/([^/]+)\//)?.[1];
          try {
            await readSavings(client, userId, resource ? `/circles/${resource}` : "/circles", controller.signal);
          } catch {
            throw new OutcomeCheckError();
          }
          if (readOnly) return null;
        }
        rememberPendingOperation(storageKey, operation);
        return await enginePost<Circle>(`/savings${operation.path}`, operation.body ?? {}, controller.signal, headers);
      } finally {
        window.clearTimeout(timer);
      }
    },
    onSuccess: async () => {
      if (client.getQueryData<SavingsSession>(sessionKey)?.user_id === userId) {
        await client.invalidateQueries({ queryKey: ["savings", userId] });
      }
    },
  });
  async function run(operation: Operation, checking: boolean, readOnly = false, abandoning = false) {
    if (active.current) return;
    active.current = true;
    setPathError(null);
    try {
      let circle: Circle | null;
      try {
        circle = await action.mutateAsync({ operation, checking, readOnly, abandoning });
      } catch (error) {
        if (isSavingsAccessError(error)) void client.invalidateQueries({ queryKey: sessionKey });
        if (abandoning) return;
        if (unknownOutcome(error) || error instanceof OutcomeCheckError ||
          (checking && (!(error instanceof EngineError) || error.status === 401))) {
          setPending({ operation, restored: readOnly });
          setRetryOriginal(false);
        } else {
          setPending(null);
          setRetryOriginal(false);
          rememberPendingOperation(storageKey, null);
          if (navigator.onLine) void client.invalidateQueries({ queryKey: ["savings", userId] });
        }
        return;
      }
      if (!circle && !abandoning) {
        setRetryOriginal(true);
        return;
      }
      rememberPendingOperation(storageKey, null);
      if (client.getQueryData<SavingsSession>(sessionKey)?.user_id === userId) {
        setPending(null);
        setRetryOriginal(false);
        if (circle) (operation.onCommitted ?? (readOnly || abandoning ? onRecovered : undefined))?.(circle);
      }
    } finally {
      active.current = false;
    }
  }
  return {
    isPending: action.isPending,
    reset: action.reset,
    error: pathError ?? action.error,
    uncertain: Boolean(pending) && !retryOriginal,
    checking: action.isPending && Boolean(pending),
    retryOriginal,
    restoredOperation: Boolean(pending?.restored),
    check: () => pending && run(pending.operation, true, pending.restored),
    abandon: () => pending && run(pending.operation, true, true, true),
    submit: (write: Write) => {
      if (active.current) return;
      if (pending && !retryOriginal) return;
      if (!pending) {
        const saved = loadPendingOperation(storageKey);
        if (saved) {
          setPending({ operation: saved, restored: true });
          return;
        }
      }
      if (pending && pending.operation.path !== write.path) {
        setPathError(new Error("Repeat the earlier action with its original details first."));
        return;
      }
      return run({ ...write, key: pending?.operation.key ?? crypto.randomUUID() }, Boolean(pending));
    },
  };
}

export type SavingsAction = ReturnType<typeof useSavingsAction>;

export function useBankFeed(userId: string, id: string, enabled: boolean) {
  const client = useQueryClient();
  return useQuery({
    queryKey: ["savings", userId, "bank-feed", id],
    queryFn: ({ signal }) =>
      readSavings<components["schemas"]["BankFeed"]>(client, userId,
        `/circles/${encodeURIComponent(id)}/bank-feed`,
        signal,
      ),
    enabled,
    refetchInterval: 10_000,
  });
}

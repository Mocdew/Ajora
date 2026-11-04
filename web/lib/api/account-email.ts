"use client";

import { engineGet, enginePost } from "./engine";
import type { components } from "./engine-schema";

export type AccountEmailStatus = components["schemas"]["EmailStatus"];
type AccountEmailMessage = components["schemas"]["AuthMessage"];

export const accountEmailKey = (userId: string) => ["account-email", userId] as const;

export function getAccountEmailStatus(signal?: AbortSignal) {
  return engineGet<AccountEmailStatus>("/auth/email/status", signal);
}

export function requestPasswordReset(email: string) {
  return enginePost<AccountEmailMessage>("/auth/password/forgot", { email: email.trim() });
}

export function resetPassword(token: string, password: string) {
  return enginePost<AccountEmailMessage>("/auth/password/reset", { token, password });
}

export function requestEmailVerification() {
  return enginePost<AccountEmailMessage>("/auth/email/request", {});
}

export function verifyEmail(token: string) {
  return enginePost<AccountEmailMessage>("/auth/email/verify", { token });
}

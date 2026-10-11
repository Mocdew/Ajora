"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ConfirmDialog — a minimal, accessible modal for confirming a destructive-looking
 * action (here: revoking an account's consent). No external primitive dependency.
 *
 * Accessibility: role="dialog" + aria-modal, labelled/described by its title/body,
 * Escape to cancel, backdrop click to cancel, focus moved to the confirm button on
 * open and restored to the opener on close, and a focus trap across the two buttons.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const openerRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    // Focus the confirm action once mounted.
    const id = window.setTimeout(() => confirmRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(id);
      openerRef.current?.focus?.();
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) {
        e.preventDefault();
        onCancel();
      }
      if (e.key === "Tab") {
        // Trap focus between the two buttons.
        const a = cancelRef.current;
        const b = confirmRef.current;
        if (!a || !b) return;
        const active = document.activeElement;
        if (e.shiftKey && active === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && active === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-hidden={false}
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={() => !pending && onCancel()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg"
      >
        <h2
          id="confirm-dialog-title"
          className="font-display text-lg font-semibold tracking-tight text-foreground"
        >
          {title}
        </h2>
        <div
          id="confirm-dialog-desc"
          className="mt-2 text-sm leading-relaxed text-muted-foreground"
        >
          {description}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className={cn(
              "inline-flex items-center rounded-md border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground",
              "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={cn(
              "inline-flex items-center rounded-md px-3.5 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:cursor-not-allowed disabled:opacity-60",
              tone === "danger"
                ? "bg-negative text-negative-foreground hover:bg-negative/90 focus-visible:ring-negative"
                : "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring",
            )}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";

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
        className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={() => !pending && onCancel()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="relative w-full max-w-md rounded-2xl border border-border bg-popover p-6 text-popover-foreground shadow-xl animate-in fade-in zoom-in-95 duration-300"
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold tracking-tight text-foreground"
        >
          {title}
        </h2>
        <div
          id="confirm-dialog-desc"
          className="mt-2 text-sm text-muted-foreground"
        >
          {description}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="btn-secondary"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={tone === "danger" ? "btn bg-negative text-negative-foreground hover:bg-negative/90" : "btn-primary"}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

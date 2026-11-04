"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToggleProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "onChange" | "type"
  > {
  /** Controlled checked state. */
  checked?: boolean;
  /** Uncontrolled initial state. */
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Accessible label; required when no visible <label> wraps the toggle. */
  label?: string;
}

/**
 * Toggle — an accessible on/off switch (role="switch").
 *
 * Supports controlled (`checked` + `onCheckedChange`) and uncontrolled
 * (`defaultChecked`) use. No external primitive dependency so it builds clean.
 */
const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  (
    {
      className,
      checked,
      defaultChecked = false,
      onCheckedChange,
      disabled,
      label,
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) => {
    const isControlled = checked !== undefined;
    const [internal, setInternal] = React.useState(defaultChecked);
    const isOn = isControlled ? checked : internal;

    const toggle = () => {
      if (disabled) return;
      const next = !isOn;
      if (!isControlled) setInternal(next);
      onCheckedChange?.(next);
    };

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={isOn}
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        data-state={isOn ? "on" : "off"}
        onClick={toggle}
        className={cn(
          "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isOn ? "bg-accent" : "bg-muted-foreground/40",
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-full shadow-sm ring-0 transition-transform duration-500",
            isOn ? "translate-x-5 bg-background" : "translate-x-0 bg-foreground",
          )}
        />
      </button>
    );
  },
);
Toggle.displayName = "Toggle";

export { Toggle };

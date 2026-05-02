import { cn } from "@shared/lib/cn";
import { hapticTap } from "@shared/lib/haptic";
import { useAnnounce } from "@shared/components/ui/ScreenReaderAnnouncer";
import type { ChangeEvent } from "react";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  /**
   * Custom screen-reader announcement on toggle. Receives the new
   * `checked` value. Defaults to a Ukrainian "{label} увімкнено / вимкнено"
   * message when `label` is provided. Pass an explicit empty string to
   * suppress announcements.
   */
  announceText?: (checked: boolean) => string;
}

/**
 * iOS-style pill toggle switch.
 *
 * - 44×26 px track satisfies the 44px minimum touch target.
 * - Uses a hidden `<input type="checkbox">` for form semantics and a11y.
 * - Thumb slides with a 200ms spring transition.
 *
 * Expects to be placed inside a `<label>` that already provides visible
 * accessible text (e.g. `ToggleRow`).
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  className,
  announceText,
}: SwitchProps) {
  const { announce } = useAnnounce();
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    hapticTap();
    const next = e.target.checked;
    onChange(next);
    // Visual checked state already conveys this to sighted users; the
    // aria-live announcement closes the gap for screen readers, who
    // otherwise only hear "checkbox, checked/not checked" with no
    // context about *what* was toggled.
    const text = announceText
      ? announceText(next)
      : label
        ? `${label} ${next ? "увімкнено" : "вимкнено"}`
        : "";
    if (text) announce(text);
  };

  return (
    <label
      className={cn(
        "relative inline-flex items-center cursor-pointer select-none gap-2",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      <span className="relative inline-flex">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
        />
        <span
          className={cn(
            "block w-[44px] h-[26px] rounded-full transition-colors duration-200",
            "bg-line peer-checked:bg-brand-500",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/45 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg",
          )}
        />
        <span
          className={cn(
            "absolute left-[3px] top-[3px] block w-5 h-5 rounded-full bg-panel shadow-card",
            "transition-transform duration-200",
            "peer-checked:translate-x-[18px]",
          )}
        />
      </span>
      {label && <span className="text-sm text-text">{label}</span>}
    </label>
  );
}

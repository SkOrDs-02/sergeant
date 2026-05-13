import {
  forwardRef,
  useCallback,
  useId,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { cn } from "@shared/lib/ui/cn";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { useAnnounce } from "@shared/components/ui/ScreenReaderAnnouncer";

/**
 * Sergeant Design System — Switch (toggle).
 *
 * Token-styled iOS-style pill toggle. Two sizes (`sm` 36×20 / `md`
 * 44×26) with token colours, label + description slots, disabled and
 * error states, and the same `focus-visible:ring-2 ring-brand-500/45`
 * contract shared with `Button` / `Input` (Hard Rule #14).
 *
 * The interactive element is a real `<input type="checkbox"
 * role="switch">` (WAI-ARIA: `role="switch"` is explicitly allowed on
 * a checkbox input). This keeps:
 *
 *   - Native keyboard semantics (`Space` toggles, focus rings work).
 *   - Form participation when `name` is set.
 *   - `aria-checked` automatically derived by AT from the `checked`
 *     attribute, plus our explicit `aria-checked` mirror for older
 *     screen-readers.
 *   - `aria-labelledby` / `aria-describedby` pointing at the visible
 *     label and description so AT reads them as part of the switch.
 *
 * Works both controlled (`checked` + `onChange`) and uncontrolled
 * (`defaultChecked` + optional `onChange`).
 */

export type SwitchSize = "sm" | "md";

export interface SwitchProps {
  /** Controlled value. Omit to use `defaultChecked` (uncontrolled). */
  checked?: boolean;
  /** Uncontrolled initial value. */
  defaultChecked?: boolean;
  /** Fired whenever the user toggles the switch. */
  onChange?: (checked: boolean) => void;
  /** Token-sized track. `sm` 36×20, `md` 44×26 (default). */
  size?: SwitchSize;
  /** Visible label rendered to the right of the track. */
  label?: ReactNode;
  /** Optional description rendered below the label. */
  description?: ReactNode;
  /** Disable interaction and visually mute the control. */
  disabled?: boolean;
  /** Mark as invalid — adds a danger ring + `aria-invalid` + tints
   *  the description if present. */
  error?: boolean;
  /** Optional `id` for the input. */
  id?: string;
  /** Optional `name` so the switch participates in native forms. */
  name?: string;
  /** Checkbox `value` when checked. Defaults to `"on"`. */
  value?: string;
  /** Custom screen-reader announcement on toggle. Defaults to a
   *  Ukrainian `{label} увімкнено / вимкнено` message when `label`
   *  is a plain string. Return an empty string to suppress. */
  announceText?: (checked: boolean) => string;
  /** Optional override for the outer wrapper. */
  className?: string;
  /** Native `aria-label` fallback when no visible `label`. */
  "aria-label"?: string;
}

const trackSize: Record<SwitchSize, string> = {
  sm: "w-9 h-5",
  md: "w-11 h-6",
};

const thumbSize: Record<SwitchSize, string> = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
};

const thumbCheckedTranslate: Record<SwitchSize, string> = {
  sm: "peer-checked:translate-x-4",
  md: "peer-checked:translate-x-5",
};

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  {
    checked,
    defaultChecked,
    onChange,
    size = "md",
    label,
    description,
    disabled = false,
    error = false,
    id,
    name,
    value = "on",
    announceText,
    className,
    "aria-label": ariaLabel,
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? `switch-${generatedId}`;
  const labelId = `${inputId}-label`;
  const descId = `${inputId}-description`;
  const { announce } = useAnnounce();

  const isControlled = checked !== undefined;
  const [internalChecked, setInternalChecked] = useState<boolean>(
    defaultChecked ?? false,
  );
  const currentChecked = isControlled ? checked : internalChecked;

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      const next = e.target.checked;
      if (!isControlled) setInternalChecked(next);
      hapticTap();
      onChange?.(next);
      const text = announceText
        ? announceText(next)
        : typeof label === "string"
          ? `${label} ${next ? "увімкнено" : "вимкнено"}`
          : "";
      if (text) announce(text);
    },
    [announce, announceText, disabled, isControlled, label, onChange],
  );

  const trackBg = currentChecked
    ? "bg-brand-strong"
    : error
      ? "bg-danger-soft"
      : "bg-line";

  const ringColor = error
    ? "peer-focus-visible:ring-danger/45"
    : "peer-focus-visible:ring-brand-500/45";

  return (
    <span
      className={cn(
        "inline-flex items-start gap-3",
        disabled && "opacity-60",
        className,
      )}
    >
      <span className="relative inline-flex shrink-0 items-center">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          role="switch"
          name={name}
          value={value}
          checked={currentChecked}
          aria-checked={currentChecked}
          aria-invalid={error || undefined}
          aria-label={!label && ariaLabel ? ariaLabel : undefined}
          aria-labelledby={label ? labelId : undefined}
          aria-describedby={description ? descId : undefined}
          disabled={disabled}
          onChange={handleChange}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            "relative inline-flex items-center rounded-full",
            "transition-colors duration-200",
            "outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg",
            ringColor,
            trackSize[size],
            trackBg,
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
        >
          <span
            className={cn(
              "absolute left-[3px] rounded-full bg-panel shadow-card",
              "transition-transform duration-200",
              thumbSize[size],
              thumbCheckedTranslate[size],
            )}
          />
        </span>
      </span>

      {(label || description) && (
        // The toggle is the `<input role="switch">` above; the label /
        // description block is a passive presentational region. The
        // input is `aria-labelledby` + `aria-describedby` so AT reads
        // them as part of the switch — and because the input is `peer`
        // sr-only with `id`, an outer `<label htmlFor>` can still
        // forward clicks.
        <span className="flex-1 min-w-0 leading-snug select-none">
          {label && (
            <label
              id={labelId}
              htmlFor={inputId}
              className={cn(
                "block text-style-label text-text",
                disabled ? "cursor-not-allowed text-muted" : "cursor-pointer",
              )}
            >
              {label}
            </label>
          )}
          {description && (
            <span
              id={descId}
              className={cn(
                "block text-xs mt-0.5",
                error ? "text-danger" : "text-muted",
              )}
            >
              {description}
            </span>
          )}
        </span>
      )}
    </span>
  );
});

Switch.displayName = "Switch";

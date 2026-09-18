import { forwardRef, useId, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Input, type InputProps } from "./Input";
import {
  classifyDateBound,
  dateBoundMessage,
  HARD_MAX_DAY_KEY,
  HARD_MIN_DAY_KEY,
} from "@shared/lib/time/dateBounds";

export interface DateFieldProps extends Omit<
  InputProps,
  "type" | "label" | "helperText"
> {
  label?: string | undefined;
  helperText?: string | undefined;
  /** Visible while the native date input is empty and unfocused. */
  emptyLabel?: string | undefined;
  /**
   * Apply the shared calendar bounds (beta-input-boundaries spec): clamp the
   * native picker to the hard window and surface a soft-window warning /
   * hard-window error under the field.
   *
   * On by default so every date in the app behaves the same way without each
   * call site re-deriving it. A caller's own `helperText` / `error` always
   * wins — pass `bounded={false}` to opt out entirely.
   */
  bounded?: boolean | undefined;
}

/**
 * iOS-safe date input.
 *
 * Mobile Safari gives `input[type=date]` an intrinsic inline size and does
 * not consistently render a useful empty-state label. The explicit
 * min/max-inline contract prevents card overflow; the overlay supplies a
 * readable empty state without replacing the native date picker.
 */
export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(
  function DateField(
    {
      id: idProp,
      label,
      helperText,
      emptyLabel = "Обери дату",
      bounded = true,
      value,
      className,
      error,
      onFocus,
      onBlur,
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) {
    const generatedId = useId();
    const id = idProp ?? generatedId;
    const [focused, setFocused] = useState(false);
    const isEmpty = value == null || String(value) === "";

    // Explicit caller state wins over the derived one — a form that already
    // knows why a date is wrong should say so in its own words.
    const bound = bounded && !isEmpty ? classifyDateBound(String(value)) : "ok";
    const resolvedError = error ?? bound === "invalid";
    const resolvedHelperText =
      helperText ?? dateBoundMessage(bound) ?? undefined;
    const helperId = resolvedHelperText ? `${id}-helper` : undefined;

    return (
      <div className="flex w-full min-w-0 max-w-full flex-col gap-1">
        {label ? (
          <label
            htmlFor={id}
            className="text-style-label text-text leading-snug"
          >
            {label}
          </label>
        ) : null}
        <div className="relative grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl border border-line bg-panelHi focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-focus/30">
          <Input
            {...(bounded
              ? { min: HARD_MIN_DAY_KEY, max: HARD_MAX_DAY_KEY }
              : {})}
            {...props}
            ref={ref}
            id={id}
            type="date"
            value={value}
            error={resolvedError}
            aria-label={ariaLabel ?? label ?? emptyLabel}
            aria-describedby={helperId}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            className={cn(
              "min-w-0 max-w-full border-0 rounded-[calc(1rem-1px)] focus-visible:border-transparent focus-visible:ring-0 [min-inline-size:0] [inline-size:100%]",
              className,
            )}
          />
          {isEmpty && !focused ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 right-11 flex items-center rounded-l-2xl bg-panelHi px-4 text-style-body text-subtle"
            >
              {emptyLabel}
            </span>
          ) : null}
        </div>
        {resolvedHelperText ? (
          <p
            id={helperId}
            role={resolvedError ? "alert" : "status"}
            className={cn(
              "text-style-caption leading-snug",
              resolvedError
                ? "text-danger-strong dark:text-danger"
                : bound === "warn"
                  ? "text-warning-strong dark:text-warning"
                  : "text-subtle",
            )}
          >
            {resolvedHelperText}
          </p>
        ) : null}
      </div>
    );
  },
);

import { forwardRef, useId, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Input, type InputProps } from "./Input";

export interface DateFieldProps extends Omit<
  InputProps,
  "type" | "label" | "helperText"
> {
  label?: string | undefined;
  helperText?: string | undefined;
  /** Visible while the native date input is empty and unfocused. */
  emptyLabel?: string | undefined;
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
    const helperId = helperText ? `${id}-helper` : undefined;

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
        <div className="relative grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl">
          <Input
            {...props}
            ref={ref}
            id={id}
            type="date"
            value={value}
            error={error}
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
              "min-w-0 max-w-full [min-inline-size:0] [inline-size:100%]",
              className,
            )}
          />
          {isEmpty && !focused ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-px left-px right-11 flex items-center rounded-l-2xl bg-panelHi px-4 text-base text-subtle"
            >
              {emptyLabel}
            </span>
          ) : null}
        </div>
        {helperText ? (
          <p
            id={helperId}
            role={error ? "alert" : "status"}
            className={cn(
              "text-xs leading-snug",
              error ? "text-danger-strong dark:text-danger" : "text-subtle",
            )}
          >
            {helperText}
          </p>
        ) : null}
      </div>
    );
  },
);

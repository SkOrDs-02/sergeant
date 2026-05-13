import type { CSSProperties, ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";

/**
 * Sergeant Design System — ProgressBar.
 *
 * Linear progress indicator. Supports determinate and indeterminate
 * states, four size tiers (`xs` 2 px → `lg` 8 px), four status
 * variants, and an optional centred inner label.
 *
 * - All fills use the `*-strong` companion (Hard Rule #9) so the
 *   white inner text stays AA-contrast against the saturated fill.
 * - The indeterminate animation respects `prefers-reduced-motion:
 *   reduce` — under reduced motion the bar falls back to a slow
 *   `pulse-soft` so users still get a "we're working" affordance
 *   without continuous horizontal motion.
 */

export type ProgressBarSize = "xs" | "sm" | "md" | "lg";
export type ProgressBarVariant = "brand" | "success" | "warning" | "danger";

export interface ProgressBarProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "children"
> {
  /** Current value when determinate. Ignored if `indeterminate` is `true`. */
  value?: number;
  /** Upper bound. Default 100. */
  max?: number;
  /** Render as indeterminate (no `value`). */
  indeterminate?: boolean;
  /** Token-sized track thickness. */
  size?: ProgressBarSize;
  /** Status colour. Default `brand`. */
  variant?: ProgressBarVariant;
  /** Optional content rendered inside / next to the bar (e.g. "65%"). */
  label?: ReactNode;
  /** Where to place the label. Default `inside` when `size` is `lg`,
   *  otherwise `outside`. */
  labelPlacement?: "inside" | "outside";
  /** Accessible name. */
  "aria-label"?: string;
}

const sizeClass: Record<ProgressBarSize, string> = {
  xs: "h-1",
  sm: "h-1.5",
  md: "h-2",
  lg: "h-3",
};

const fillClass: Record<ProgressBarVariant, string> = {
  brand: "bg-brand-strong",
  success: "bg-success-strong",
  warning: "bg-warning-strong",
  danger: "bg-danger-strong",
};

const labelTextClass: Record<ProgressBarSize, string> = {
  xs: "text-2xs",
  sm: "text-2xs",
  md: "text-xs",
  lg: "text-xs",
};

export function ProgressBar({
  value = 0,
  max = 100,
  indeterminate = false,
  size = "md",
  variant = "brand",
  label,
  labelPlacement,
  className,
  "aria-label": ariaLabel,
  ...rest
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.max(0, Math.min(value, safeMax));
  const pct = (clamped / safeMax) * 100;
  const placement = labelPlacement ?? (size === "lg" ? "inside" : "outside");
  const accessible =
    ariaLabel ??
    (indeterminate
      ? "Завантаження…"
      : max === 100
        ? `${Math.round(pct)}%`
        : `${clamped} з ${safeMax}`);

  const fillStyle: CSSProperties = indeterminate ? {} : { width: `${pct}%` };

  return (
    <div className={cn("flex flex-col gap-1", className)} {...rest}>
      <div
        role="progressbar"
        aria-label={accessible}
        aria-valuemin={0}
        aria-valuemax={indeterminate ? undefined : safeMax}
        aria-valuenow={indeterminate ? undefined : clamped}
        aria-busy={indeterminate || undefined}
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-line",
          sizeClass[size],
        )}
      >
        {indeterminate ? (
          <div
            aria-hidden="true"
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              fillClass[variant],
              // Reduced motion falls back to a slow pulse on the full
              // width track so the user still sees "we're working" but
              // without the long-range translation that triggers
              // vestibular discomfort. `motion-safe:` runs the slide.
              "motion-reduce:w-full motion-reduce:animate-pulse-soft",
              "motion-safe:w-2/5 motion-safe:animate-progress-indeterminate",
            )}
          />
        ) : (
          <div
            aria-hidden="true"
            className={cn(
              "h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300",
              fillClass[variant],
            )}
            style={fillStyle}
          >
            {label && placement === "inside" && (
              <span
                className={cn(
                  "absolute inset-0 flex items-center justify-center font-medium text-white tabular-nums",
                  labelTextClass[size],
                )}
              >
                {label}
              </span>
            )}
          </div>
        )}
      </div>
      {label && placement === "outside" && !indeterminate && (
        <div
          className={cn(
            "flex justify-end font-medium text-muted tabular-nums",
            labelTextClass[size],
          )}
        >
          {label}
        </div>
      )}
    </div>
  );
}

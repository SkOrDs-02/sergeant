import type { ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";

/**
 * Sergeant Design System — ProgressCircle.
 *
 * Radial progress indicator. Supports determinate (with optional inner
 * label) and indeterminate (rotating arc) modes, four size tiers, and
 * four status variants. Designed as the round companion to
 * `ProgressBar`; for KPI tiles with module-tinted text fills, see
 * `ProgressRing` (variant-driven token colours, no indeterminate
 * mode).
 *
 * - Stroke uses `currentColor` so the variant maps to a single
 *   `text-{c}-strong` token (Hard Rule #9 — strong companion behind
 *   ring fills + AA contrast on cream surfaces).
 * - Indeterminate mode honours `prefers-reduced-motion: reduce` and
 *   falls back to a slow `pulse-soft` so vestibular-sensitive users
 *   still see a "we're working" affordance without rotation.
 */

export type ProgressCircleSize = "xs" | "sm" | "md" | "lg";
export type ProgressCircleVariant = "brand" | "success" | "warning" | "danger";

export interface ProgressCircleProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "children"
> {
  value?: number;
  max?: number;
  indeterminate?: boolean;
  size?: ProgressCircleSize;
  /** Override the stroke thickness (px). Defaults to `diameter / 10`. */
  strokeWidth?: number;
  variant?: ProgressCircleVariant;
  /** Optional inner label (e.g. percent). Omitted in indeterminate mode. */
  label?: ReactNode;
  /** Force-hide the default percent text. */
  hideLabel?: boolean;
  "aria-label"?: string;
}

const sizePx: Record<ProgressCircleSize, number> = {
  xs: 28,
  sm: 44,
  md: 64,
  lg: 96,
};

const variantClass: Record<ProgressCircleVariant, string> = {
  brand: "text-brand-strong",
  success: "text-success-strong",
  warning: "text-warning-strong",
  danger: "text-danger-strong",
};

const labelTextClass: Record<ProgressCircleSize, string> = {
  xs: "text-2xs",
  sm: "text-2xs",
  md: "text-xs",
  lg: "text-sm",
};

export function ProgressCircle({
  value = 0,
  max = 100,
  indeterminate = false,
  size = "md",
  strokeWidth,
  variant = "brand",
  label,
  hideLabel = false,
  className,
  "aria-label": ariaLabel,
  ...rest
}: ProgressCircleProps) {
  const diameter = sizePx[size];
  const stroke = strokeWidth ?? Math.max(2, Math.round(diameter / 10));
  const radius = (diameter - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.max(0, Math.min(value, safeMax));
  const pct = clamped / safeMax;
  const dashOffset = circumference * (1 - pct);
  const percentText = Math.round(pct * 100);
  const accessible =
    ariaLabel ??
    (indeterminate
      ? "Завантаження…"
      : max === 100
        ? `${percentText}%`
        : `${clamped} з ${safeMax}`);

  const visibleLabel =
    !indeterminate && !hideLabel
      ? label !== undefined
        ? label
        : `${percentText}%`
      : null;

  return (
    <div
      role="progressbar"
      aria-label={accessible}
      aria-valuemin={0}
      aria-valuemax={indeterminate ? undefined : safeMax}
      aria-valuenow={indeterminate ? undefined : clamped}
      aria-busy={indeterminate || undefined}
      className={cn(
        "relative inline-flex items-center justify-center",
        variantClass[variant],
        className,
      )}
      style={{ width: diameter, height: diameter }}
      {...rest}
    >
      <svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        aria-hidden="true"
        className={cn(
          "-rotate-90",
          indeterminate &&
            "motion-safe:animate-[spin_1.1s_linear_infinite] motion-reduce:animate-pulse-soft",
        )}
      >
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={stroke}
        />
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={
            indeterminate
              ? `${circumference * 0.25} ${circumference}`
              : circumference
          }
          strokeDashoffset={indeterminate ? 0 : dashOffset}
          className="motion-safe:transition-all motion-safe:duration-300"
        />
      </svg>
      {visibleLabel != null && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute font-semibold text-text tabular-nums",
            labelTextClass[size],
          )}
        >
          {visibleLabel}
        </span>
      )}
    </div>
  );
}

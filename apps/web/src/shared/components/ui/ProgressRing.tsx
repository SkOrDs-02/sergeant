import type { ReactNode } from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — ProgressRing
 *
 * Radial progress indicator built with an SVG stroke-dasharray trick.
 * Used for KPI completion (Routine habit streaks, Fizruk workout goals,
 * Nutrition daily macro rings, Finyk budget burn-down).
 *
 * Variants map to module / status semantic tokens so dark-mode works
 * automatically via `stroke="currentColor"` + Tailwind `text-*` utility.
 *
 * API:
 * - `value` — current progress, 0..`max` (clamped).
 * - `max` — upper bound (default 100).
 * - `size` — outer diameter in px (sm 48 / md 72 / lg 96 / xl 128).
 * - `strokeWidth` — ring thickness in px; defaults to `size / 12`.
 * - `variant` — colour token for the filled arc.
 * - `label` — optional centred content (string / ReactNode). If omitted
 *   we render `Math.round((value/max)*100)%`.
 * - `showPercent` — force the default percent label even when `label`
 *   is `undefined` (default `true`; pass `false` to hide text entirely).
 *
 * A11y:
 * - `role="progressbar"` + `aria-valuenow` / `aria-valuemin` /
 *   `aria-valuemax`. Pass `aria-label` or `aria-labelledby` via spread
 *   props when the visual label is not descriptive.
 * - `motion-safe:transition-all` on the filled arc — respects
 *   `prefers-reduced-motion: reduce`.
 */

export type ProgressRingVariant =
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition";

export type ProgressRingSize = "xs" | "sm" | "md" | "lg" | "xl";

const variantColor: Record<ProgressRingVariant, string> = {
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  finyk: "text-finyk",
  fizruk: "text-fizruk",
  routine: "text-routine",
  nutrition: "text-nutrition",
};

const sizePx: Record<ProgressRingSize, number> = {
  xs: 32,
  sm: 48,
  md: 72,
  lg: 96,
  xl: 128,
};

const labelTextSize: Record<ProgressRingSize, string> = {
  xs: "text-micro",
  sm: "text-xs",
  md: "text-sm",
  lg: "text-lg",
  xl: "text-2xl",
};

export interface ProgressRingProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "children"
> {
  value: number;
  max?: number;
  size?: ProgressRingSize;
  strokeWidth?: number;
  variant?: ProgressRingVariant;
  label?: ReactNode;
  showPercent?: boolean;
  /** Alias for `showPercent` (kept for parity with showcase callers). */
  showValue?: boolean;
}

export function ProgressRing({
  value,
  max = 100,
  size = "md",
  strokeWidth,
  variant = "accent",
  label,
  showPercent = true,
  showValue,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: ProgressRingProps) {
  const showLabel = showValue ?? showPercent;
  const diameter = sizePx[size];
  const stroke = strokeWidth ?? Math.max(2, Math.round(diameter / 12));
  const radius = (diameter - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.max(0, Math.min(value, safeMax));
  const pct = clamped / safeMax;
  const dashOffset = circumference * (1 - pct);
  const percentText = Math.round(pct * 100);

  const displayLabel =
    label !== undefined ? label : showLabel ? `${percentText}%` : null;

  // ARIA progressbar requires an accessible name. The visible centre label
  // is `aria-hidden`, so derive a default `aria-label` ("65%" / "65 / 100")
  // when the caller did not pass one explicitly.
  const accessibleLabel =
    ariaLabel ??
    (ariaLabelledBy
      ? undefined
      : max === 100
        ? `${percentText}%`
        : `${clamped} / ${safeMax}`);

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={accessibleLabel}
      aria-labelledby={ariaLabelledBy}
      className={cn(
        "relative inline-flex items-center justify-center",
        variantColor[variant],
        className,
      )}
      style={{ width: diameter, height: diameter }}
      {...props}
    >
      <svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        aria-hidden="true"
        className="-rotate-90"
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
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="motion-safe:transition-all motion-safe:duration-300"
        />
      </svg>
      {displayLabel != null && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 flex items-center justify-center font-semibold tabular-nums text-text",
            labelTextSize[size],
          )}
        >
          {displayLabel}
        </span>
      )}
    </div>
  );
}

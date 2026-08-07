/**
 * Last validated: 2026-05-18
 * Status: Active
 */
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
 * Module variants (`finyk` / `fizruk` / `routine` / `nutrition`) route
 * the arc through the `--c-chart-{module}` T2 chart vars instead of the
 * `text-{module}` primary palette. Why: the chart vars are tuned for
 * AA contrast against `bg-bg` (5:1+) at small sizes while the primary
 * palette is tuned for fills + chrome. The status variants (`success` /
 * `warning` / `danger` / `info` / `accent`) keep the `currentColor`
 * + `text-*` path unchanged.
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
 * - `incomplete` — dashes the background track to signal "partial data",
 *   not "deficit" (nutrition daily ring — canon §5.2). Purely visual on
 *   the track circle; the filled arc keeps its normal solid stroke so the
 *   logged progress still reads clearly.
 * - `onHero` — the ring sits on a `Card prominence="hero"` surface. The
 *   default `--c-chart-*` tiers are tuned against cream `bg-bg`, and a
 *   hero card is dark in every theme, so on a hero they collapse into the
 *   fill — `chart-nutrition` (lime-800) IS the light nutrition hero
 *   gradient's start stop, which made the nutrition macro rings invisible
 *   in light theme (screenshot bug 2026-08-07). `onHero` routes the arc
 *   through the `--c-chart-*-on-hero` -400 tier and flips the track to
 *   `hero-ink` — the same fix `routine/DayProgressRing` already applies
 *   by hand for the routine hero.
 *
 * A11y:
 * - `role="progressbar"` + `aria-valuenow` / `aria-valuemin` /
 *   `aria-valuemax`. Pass `aria-label` or `aria-labelledby` via spread
 *   props when the visual label is not descriptive.
 * - The dashed track is not the only signal: `incomplete` appends a
 *   Ukrainian text equivalent to the accessible name so screen-reader
 *   users get the same "partial data" meaning as the dashed visual.
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
  // Module variants use the chart-T2 vars via inline stroke; the `text-*`
  // class still tints the centre label so percentages stay branded.
  finyk: "text-finyk",
  fizruk: "text-fizruk",
  routine: "text-routine",
  nutrition: "text-nutrition",
};

const MODULE_VARIANTS = new Set<ProgressRingVariant>([
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
]);

const chartVar: Record<"finyk" | "fizruk" | "routine" | "nutrition", string> = {
  finyk: "rgb(var(--c-chart-finyk))",
  fizruk: "rgb(var(--c-chart-fizruk))",
  routine: "rgb(var(--c-chart-routine))",
  nutrition: "rgb(var(--c-chart-nutrition))",
};

const sizePx: Record<ProgressRingSize, number> = {
  xs: 32,
  sm: 48,
  md: 72,
  lg: 96,
  xl: 128,
};

// glyph scales with ring size, not a type role
const labelTextSize: Record<ProgressRingSize, string> = {
  xs: "text-style-caption",
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
  /** Dashes the track ring + appends a text a11y suffix — see file header. */
  incomplete?: boolean;
  /** Ring sits on a `Card prominence="hero"` fill — see file header. */
  onHero?: boolean;
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
  incomplete = false,
  onHero = false,
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

  const isModuleVariant = MODULE_VARIANTS.has(variant);
  // On a hero fill EVERY variant — module and status alike — routes through
  // the `-on-hero` tier: `warning`'s amber-700 and `routine`'s coral-700 sit
  // as flat on a saturated hero as the module chart vars do. Off a hero only
  // module variants leave `currentColor` (see the `chartVar` note above).
  const arcStroke = onHero
    ? `rgb(var(--c-chart-${variant}-on-hero))`
    : isModuleVariant
      ? chartVar[variant as "finyk" | "fizruk" | "routine" | "nutrition"]
      : "currentColor";

  // ARIA progressbar requires an accessible name. The visible centre label
  // is `aria-hidden`, so derive a default `aria-label` ("65%" / "65 / 100")
  // when the caller did not pass one explicitly.
  const baseAccessibleLabel =
    ariaLabel ??
    (ariaLabelledBy
      ? undefined
      : max === 100
        ? `${percentText}%`
        : `${clamped} / ${safeMax}`);
  // Text equivalent for the dashed track (Rule: visual style alone can't
  // carry meaning) — appended regardless of whether the caller passed an
  // explicit `aria-label`, so every incomplete ring reads the same way.
  const accessibleLabel =
    incomplete && baseAccessibleLabel
      ? `${baseAccessibleLabel} · неповні дані за день`
      : baseAccessibleLabel;

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
        // `text-hero-ink` on a hero: it tints the default percent label and
        // feeds the track's `currentColor` (a colored track at 15% is what
        // disappeared into the fill — neutral ink at 30% reads on both the
        // light gradient and the dark ink surface).
        onHero ? "text-hero-ink" : variantColor[variant],
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
          stroke={onHero ? "currentColor" : arcStroke}
          strokeOpacity={onHero ? 0.3 : 0.15}
          strokeWidth={stroke}
          strokeDasharray={incomplete ? "4 3" : undefined}
        />
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke={arcStroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="motion-safe:transition-all motion-safe:duration-slow"
        />
      </svg>
      {displayLabel != null && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 flex items-center justify-center font-semibold tabular-nums",
            onHero ? "text-hero-ink" : "text-text",
            labelTextSize[size],
          )}
        >
          {displayLabel}
        </span>
      )}
    </div>
  );
}

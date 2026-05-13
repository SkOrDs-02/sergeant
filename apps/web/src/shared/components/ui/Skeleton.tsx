import type { CSSProperties } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";

import { cn } from "../../lib/ui/cn";

export type SkeletonVariant = "rect" | "text" | "avatar" | "card";

export interface SkeletonProps {
  className?: string;
  /** Use shimmer effect instead of pulse (more premium feel). Under
   *  `prefers-reduced-motion: reduce` both shimmer and pulse collapse
   *  to a static muted block (WCAG 2.3.3 + Apple HIG). */
  shimmer?: boolean;
  /** Shape preset. Defaults to `rect`. Other variants (`text`,
   *  `avatar`, `card`) are also exposed as their own components for
   *  ergonomic call-sites. */
  variant?: SkeletonVariant;
  /**
   * Inline style — primarily used for staggered `animationDelay` on rows
   * of skeletons (see `ModulePageLoader.RoutineLoader`). Forwarded to the
   * outer `<div>` only.
   */
  style?: CSSProperties;
}

const SHIMMER_OVERLAY =
  "absolute inset-0 -translate-x-full motion-safe:animate-shimmer bg-linear-to-r from-transparent via-white/10 to-transparent";

/**
 * Base skeleton loader with optional shimmer effect.
 *
 * `motion-safe:animate-pulse` respects `prefers-reduced-motion: reduce`
 * (WCAG 2.3.3 + Apple HIG reduced motion compliance). Under reduced
 * motion both the pulse and shimmer variants collapse to a static
 * muted block — the skeleton's *presence* still communicates loading
 * without animation.
 *
 * Variants:
 * - `rect` (default) — a flexible block sized via `className`.
 * - `text`  — a single 12 px-tall line; for multi-line text loaders
 *   use the dedicated `<SkeletonText>` component which supports
 *   randomized widths.
 * - `avatar` — a perfect circle; size via `className`
 *   (`w-12 h-12 rounded-full`).
 * - `card` — a tall block with `rounded-3xl` (card radius); intended
 *   for full card-sized placeholders.
 */
export function Skeleton({
  className,
  shimmer = false,
  variant = "rect",
  style,
}: SkeletonProps) {
  const variantClass =
    variant === "avatar"
      ? "rounded-full aspect-square"
      : variant === "text"
        ? "rounded-xl h-3"
        : variant === "card"
          ? "rounded-3xl min-h-32"
          : "rounded-2xl";

  return (
    <div
      className={cn(
        "bg-panelHi",
        variantClass,
        shimmer ? "relative overflow-hidden" : "motion-safe:animate-pulse",
        className,
      )}
      style={style}
      aria-hidden="true"
    >
      {shimmer && <div className={SHIMMER_OVERLAY} aria-hidden="true" />}
    </div>
  );
}

/** Circle-shaped skeleton — sized via `className` (e.g. `w-12 h-12`). */
export function SkeletonAvatar({
  className,
  shimmer = false,
  style,
}: SkeletonProps) {
  return (
    <Skeleton
      variant="avatar"
      shimmer={shimmer}
      style={style}
      className={cn("w-10 h-10", className)}
    />
  );
}

/** Card-shaped skeleton with header + body lines. */
export function SkeletonCardBlock({
  className,
  shimmer = false,
  style,
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-line bg-panel p-4 space-y-3",
        className,
      )}
      style={style}
      aria-hidden="true"
    >
      <div className="flex items-center gap-3">
        <SkeletonAvatar shimmer={shimmer} className="w-10 h-10" />
        <div className="flex-1 space-y-1.5">
          <SkeletonText shimmer={shimmer} className="w-1/2" />
          <SkeletonText shimmer={shimmer} className="w-1/3 h-2" />
        </div>
      </div>
      <SkeletonText shimmer={shimmer} className="w-full" />
      <SkeletonText shimmer={shimmer} className="w-5/6" />
      <SkeletonText shimmer={shimmer} className="w-2/3" />
    </div>
  );
}

export interface SkeletonTextProps extends SkeletonProps {
  /** When > 1, renders that many lines stacked with `gap` between
   *  them; widths are randomised in the [55%, 100%] band so the
   *  paragraph reads as text rather than a single bar. The last line
   *  is always shorter to mirror real prose. */
  lines?: number;
  /** Tailwind gap class between lines when `lines > 1`. */
  gap?: string;
}

/**
 * Single line or multi-line text skeleton. Multi-line mode renders a
 * deterministic pseudo-random width distribution so consecutive
 * renders don't shift around: the seed is the line index, not
 * `Math.random()`.
 */
export function SkeletonText({
  className,
  shimmer = false,
  style,
  lines = 1,
  gap = "gap-2",
}: SkeletonTextProps) {
  if (lines > 1) {
    // Deterministic pseudo-random widths from a small bag so the
    // layout is stable across renders (no flicker / no SSR mismatch).
    const widths = ["w-full", "w-11/12", "w-10/12", "w-9/12", "w-8/12"];
    return (
      <div
        className={cn("flex flex-col", gap, className)}
        style={style}
        aria-hidden="true"
      >
        {Array.from({ length: lines }).map((_, i) => {
          const isLast = i === lines - 1;
          const widthIdx = isLast
            ? widths.length - 1
            : (i * 2 + 1) % (widths.length - 1);
          return (
            <SkeletonText
              key={i}
              shimmer={shimmer}
              className={widths[widthIdx]}
              lines={1}
            />
          );
        })}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "bg-panelHi rounded-xl h-3",
        shimmer ? "relative overflow-hidden" : "motion-safe:animate-pulse",
        className,
      )}
      style={style}
      aria-hidden="true"
    >
      {shimmer && (
        <div
          className="absolute inset-0 -translate-x-full motion-safe:animate-shimmer bg-linear-to-r from-transparent via-white/10 to-transparent"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

// ── Shape-aware skeletons ────────────────────────────────────────────────
// Per-domain placeholders that mirror the layout of the real components,
// so the transition from skeleton → real content reflows minimally and
// users get a stronger "perceived performance" cue (the page already
// looks like the right shape, content just fills in).

interface ShapeAwareSkeletonProps extends SkeletonProps {
  /** Optional module accent — tints the leading icon/avatar with the
   *  module color so loaders feel "at home" inside their module. */
  module?: ModuleAccent;
}

const MODULE_ACCENT_TINT: Record<ModuleAccent, string> = {
  finyk: "bg-finyk/10",
  fizruk: "bg-fizruk/10",
  routine: "bg-routine/10",
  nutrition: "bg-nutrition/10",
};

/**
 * SkeletonTransactionRow — placeholder for a Finyk transaction row.
 * Layout: icon · description (2 lines) · amount on the right.
 */
export function SkeletonTransactionRow({
  className,
  shimmer = false,
  module,
  style,
}: ShapeAwareSkeletonProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-2xl border border-line bg-panel",
        className,
      )}
      style={style}
      aria-hidden="true"
    >
      <div
        className={cn(
          "w-10 h-10 rounded-xl shrink-0",
          shimmer ? "relative overflow-hidden" : "motion-safe:animate-pulse",
          module ? MODULE_ACCENT_TINT[module] : "bg-panelHi",
        )}
      >
        {shimmer && (
          <div
            className="absolute inset-0 -translate-x-full motion-safe:animate-shimmer bg-linear-to-r from-transparent via-white/10 to-transparent"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <SkeletonText shimmer={shimmer} className="w-2/3" />
        <SkeletonText shimmer={shimmer} className="w-1/3 h-2" />
      </div>
      <SkeletonText shimmer={shimmer} className="w-16 h-3.5" />
    </div>
  );
}

/**
 * SkeletonBudgetBar — placeholder for a Finyk budget card with progress
 * meter underneath.
 */
export function SkeletonBudgetBar({
  className,
  shimmer = false,
  module = "finyk",
}: ShapeAwareSkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-panel p-3.5 space-y-2.5",
        className,
      )}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between gap-3">
        <SkeletonText shimmer={shimmer} className="w-24" />
        <SkeletonText shimmer={shimmer} className="w-16 h-2.5" />
      </div>
      {/* Progress track */}
      <div className="relative h-2 rounded-full overflow-hidden bg-panelHi">
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-2/5 rounded-full",
            shimmer ? "relative overflow-hidden" : "motion-safe:animate-pulse",
            module ? MODULE_ACCENT_TINT[module] : "bg-panelHi",
          )}
        >
          {shimmer && (
            <div
              className="absolute inset-0 -translate-x-full motion-safe:animate-shimmer bg-linear-to-r from-transparent via-white/15 to-transparent"
              aria-hidden="true"
            />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <SkeletonText shimmer={shimmer} className="w-20 h-2" />
        <SkeletonText shimmer={shimmer} className="w-12 h-2" />
      </div>
    </div>
  );
}

/**
 * SkeletonHabitRow — placeholder for a Routine habit row with a leading
 * checkbox-like square, label/streak text, and a trailing chip.
 */
export function SkeletonHabitRow({
  className,
  shimmer = false,
  module = "routine",
  style,
}: ShapeAwareSkeletonProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-2xl border border-line bg-panel",
        className,
      )}
      style={style}
      aria-hidden="true"
    >
      <Skeleton
        shimmer={shimmer}
        className={cn(
          "w-7 h-7 rounded-xl shrink-0",
          module ? MODULE_ACCENT_TINT[module] : "bg-panelHi",
        )}
      />
      <div className="flex-1 min-w-0 space-y-1.5">
        <SkeletonText shimmer={shimmer} className="w-1/2" />
        <SkeletonText shimmer={shimmer} className="w-1/4 h-2" />
      </div>
      <Skeleton shimmer={shimmer} className="w-10 h-5 rounded-full" />
    </div>
  );
}

/**
 * SkeletonWorkoutSet — placeholder for a Fizruk set row in an exercise log.
 * Three pill columns (weight × reps × RPE) plus a leading set-number badge.
 */
export function SkeletonWorkoutSet({
  className,
  shimmer = false,
  module = "fizruk",
  style,
}: ShapeAwareSkeletonProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-xl border border-line bg-panel",
        className,
      )}
      style={style}
      aria-hidden="true"
    >
      <Skeleton
        shimmer={shimmer}
        className={cn(
          "w-7 h-7 rounded-xl shrink-0",
          module ? MODULE_ACCENT_TINT[module] : "bg-panelHi",
        )}
      />
      <Skeleton shimmer={shimmer} className="flex-1 h-7 rounded-xl" />
      <Skeleton shimmer={shimmer} className="flex-1 h-7 rounded-xl" />
      <Skeleton shimmer={shimmer} className="flex-1 h-7 rounded-xl" />
    </div>
  );
}

/**
 * SkeletonMealCard — placeholder for a Nutrition meal entry: thumbnail
 * tile + name + macro chips row.
 */
export function SkeletonMealCard({
  className,
  shimmer = false,
  module = "nutrition",
}: ShapeAwareSkeletonProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-2xl border border-line bg-panel",
        className,
      )}
      aria-hidden="true"
    >
      <Skeleton
        shimmer={shimmer}
        className={cn(
          "w-14 h-14 rounded-xl shrink-0",
          module ? MODULE_ACCENT_TINT[module] : "bg-panelHi",
        )}
      />
      <div className="flex-1 min-w-0 space-y-2">
        <SkeletonText shimmer={shimmer} className="w-3/5" />
        <div className="flex items-center gap-1.5">
          <Skeleton shimmer={shimmer} className="w-12 h-4 rounded-full" />
          <Skeleton shimmer={shimmer} className="w-12 h-4 rounded-full" />
          <Skeleton shimmer={shimmer} className="w-12 h-4 rounded-full" />
        </div>
      </div>
    </div>
  );
}

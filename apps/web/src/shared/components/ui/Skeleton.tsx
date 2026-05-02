import type { CSSProperties } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";

import { cn } from "../../lib/cn";

export interface SkeletonProps {
  className?: string;
  /** Use shimmer effect instead of pulse (more premium feel) */
  shimmer?: boolean;
  /**
   * Inline style — primarily used for staggered `animationDelay` on rows
   * of skeletons (see `ModulePageLoader.RoutineLoader`). Forwarded to the
   * outer `<div>` only.
   */
  style?: CSSProperties;
}

/**
 * Base skeleton loader with optional shimmer effect.
 * `motion-safe:animate-pulse` respects `prefers-reduced-motion: reduce`
 * (WCAG 2.3.3 + Apple HIG reduced motion compliance).
 */
export function Skeleton({ className, shimmer = false, style }: SkeletonProps) {
  return (
    <div
      className={cn(
        "bg-panelHi rounded-2xl",
        shimmer ? "relative overflow-hidden" : "motion-safe:animate-pulse",
        className,
      )}
      style={style}
      aria-hidden="true"
    >
      {shimmer && (
        <div
          className="absolute inset-0 -translate-x-full motion-safe:animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export function SkeletonText({
  className,
  shimmer = false,
  style,
}: SkeletonProps) {
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
          className="absolute inset-0 -translate-x-full motion-safe:animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent"
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
            className="absolute inset-0 -translate-x-full motion-safe:animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent"
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
              className="absolute inset-0 -translate-x-full motion-safe:animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent"
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

/**
 * Last validated: 2026-05-18
 * Status: Active
 */
import type { ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";

/**
 * Sergeant Design System — HeroValueLine (P2 primitive)
 *
 * Composition wrapper for module hero sections (Phase 2 v2 redesign).
 * Lays out an optional progress ring next to a narrative + metric stack.
 *
 * Slots:
 *   - `ring`      — optional radial indicator (typically `<ProgressRing>` or
 *                   a `<DayProgressRing>`). Rendered on the left at ≥ sm.
 *   - `narrative` — multi-line contextual text (one or two short sentences).
 *                   Should reach for `.text-style-body-sm` / `.text-style-meta`
 *                   tokens — never raw `text-xs`.
 *   - `metric`    — the big number reveal — most commonly a `<CounterReveal>`
 *                   that uses `.text-style-display-hero` (T1 token).
 *
 * Layout:
 *   - Mobile (default):  vertical stack, ring → metric → narrative.
 *   - sm+:              horizontal row, ring | (narrative + metric stack).
 *
 * The wrapper owns spacing only; consumers pick the typography token on
 * each slot so the same primitive can be reused across modules with
 * different hierarchies (Routine vs Nutrition vs Finyk).
 */

export type HeroValueLineAlign = "start" | "center";

export interface HeroValueLineProps {
  narrative: ReactNode;
  metric: ReactNode;
  ring?: ReactNode;
  align?: HeroValueLineAlign;
  className?: string;
}

const alignmentClass: Record<HeroValueLineAlign, string> = {
  start: "items-start text-left",
  center: "items-center text-center",
};

export function HeroValueLine({
  narrative,
  metric,
  ring,
  align = "start",
  className,
}: HeroValueLineProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6",
        alignmentClass[align],
        className,
      )}
    >
      {ring != null && (
        <div className="flex shrink-0 items-center justify-center">{ring}</div>
      )}
      <div
        className={cn(
          "flex flex-1 flex-col gap-1",
          align === "center" && "sm:items-center",
        )}
      >
        <div className="text-style-display-hero text-text tabular-nums">
          {metric}
        </div>
        <div className="text-style-body-sm text-subtle">{narrative}</div>
      </div>
    </div>
  );
}

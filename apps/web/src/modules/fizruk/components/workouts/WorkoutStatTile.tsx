/**
 * Last validated: 2026-05-14
 * Status: Active
 */
/**
 * `<WorkoutStatTile>` — stat tile for the fizruk workout-summary sheet.
 *
 * Renders an uppercase eyebrow caption above a tabular-numbered value on
 * a subtle wash that adapts per theme via the `--c-fizruk-tile` /
 * `--c-fizruk-tile-border` CSS variables (light = cyan-800 wash on the
 * `bg-hero-cyan` summary header; dark = white wash on the dark panel
 * gradient). Replaces the `bg-teal-800/10 dark:bg-white/10 …` className
 * soup that used to be hand-rolled at three sibling call-sites in
 * `WorkoutFinishSheets`. See `docs/design/archive/dark-mode-audit.md` →
 * "→ new `WorkoutStatTile` primitive (WorkoutFinishSheets)".
 */
import { type ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";

export interface WorkoutStatTileProps {
  label: ReactNode;
  value: ReactNode;
  /**
   * Tile sizing. Use `lg` for hero numbers (e.g. exercise count) and
   * the default `sm` for shorter values that need a touch of breathing
   * room above them (durations, tonnages). Defaults to `sm`.
   */
  size?: "sm" | "lg";
  className?: string;
}

export function WorkoutStatTile({
  label,
  value,
  size = "sm",
  className,
}: WorkoutStatTileProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-fizruk-tile/10 border border-fizruk-tile-border/15 p-2.5 text-center",
        className,
      )}
    >
      {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift --
          Summary-sheet stat caption on the fizruk hero gradient —
          `text-fizruk-soft-fg` isn't expressed by the SectionHeading tone
          scale (which targets neutral surfaces). */}
      <div className="text-style-caption uppercase tracking-wide text-fizruk-soft-fg">
        {label}
      </div>
      <div
        className={cn(
          "font-black text-fizruk-soft-fg tabular-nums",
          size === "lg" ? "text-lg" : "text-sm mt-0.5",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Last validated: 2026-05-18
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";

/**
 * Sergeant Design System — MacroBarRow (P2 primitive)
 *
 * Vertical stack of macro progress bars — primary consumer is the
 * Nutrition Today hero (Phase 2.4). Each row shows: label | bar |
 * value/goal. The bar track uses `bg-{accent}/15` and the fill uses
 * `bg-{accent}` so the macro reads as same-family-tinted on both
 * light and dark themes.
 *
 * Accents are intentionally limited to the v2 macro palette mapping:
 *   - `nutrition` (lime, default) — kcal / protein
 *   - `warning`   (amber)         — fats
 *   - `routine`   (coral)         — carbs
 *
 * Why this mapping: 3 macros need 3 distinct hues that read AA against
 * the nutrition hero card. The set above hits ≥ 5:1 on cream + on dark
 * (`-strong` companions, Hard Rule #9). Adding `fizruk` or `finyk`
 * would clash with the hero brand identity.
 *
 * Hard Rule #16: label uses `.text-style-caption` (12px floor).
 */

export type MacroAccent = "nutrition" | "warning" | "routine";

export interface MacroItem {
  label: string;
  value: number;
  max: number;
  accent: MacroAccent;
  /** Optional unit suffix on the value (e.g. "г", "kcal"). */
  unit?: string;
}

export interface MacroBarRowProps {
  macros: MacroItem[];
  className?: string;
}

const trackClass: Record<MacroAccent, string> = {
  nutrition: "bg-nutrition/15",
  warning: "bg-warning/15",
  routine: "bg-routine/15",
};

const fillClass: Record<MacroAccent, string> = {
  nutrition: "bg-nutrition",
  warning: "bg-warning",
  routine: "bg-routine",
};

export function MacroBarRow({ macros, className }: MacroBarRowProps) {
  if (macros.length === 0) return null;

  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {macros.map((macro, idx) => {
        const safeMax = macro.max > 0 ? macro.max : 1;
        const clamped = Math.max(0, Math.min(macro.value, safeMax));
        const pct = (clamped / safeMax) * 100;
        const valueLabel = macro.unit
          ? `${macro.value} / ${macro.max} ${macro.unit}`
          : `${macro.value} / ${macro.max}`;

        return (
          <li
            key={`${macro.label}-${idx}`}
            className="flex flex-col gap-1"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-style-caption text-subtle">
                {macro.label}
              </span>
              <span className="text-style-label font-medium text-text tabular-nums">
                {valueLabel}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`${macro.label}: ${valueLabel}`}
              aria-valuenow={clamped}
              aria-valuemin={0}
              aria-valuemax={safeMax}
              className={cn(
                "relative h-2 w-full overflow-hidden rounded-full",
                trackClass[macro.accent],
              )}
            >
              <div
                aria-hidden="true"
                className={cn(
                  "h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500",
                  fillClass[macro.accent],
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

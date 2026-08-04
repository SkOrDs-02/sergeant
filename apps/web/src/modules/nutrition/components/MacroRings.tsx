import {
  ProgressRing,
  type ProgressRingVariant,
} from "@shared/components/ui/ProgressRing";

/**
 * MacroRings (V-10)
 * ─────────────────
 * Renders the daily protein / fat / carbs progress as a row of concentric
 * radial gauges instead of flat horizontal bars. Each macro reuses the
 * design-system `ProgressRing` (module chart-var stroke, animated arc,
 * `role="progressbar"` a11y) so the calorie hero ring and the macro gauges
 * read as one coherent family.
 *
 * Why rings over bars here: the three macros share one budget mental model
 * ("how full is each?"), and a compact ring communicates fullness at a
 * glance without the eye having to compare bar end-points across three
 * different max widths. The consumed value sits inside the ring; the macro
 * name and the outcome band ("ціль виконано" / "N г запас") sit beneath.
 */

export interface MacroRingDatum {
  label: string;
  consumed: number;
  goal: number;
  variant: ProgressRingVariant;
  unit?: string;
  /** Outcome band copy from the caller (e.g. "ціль виконано"). */
  outcome?: string | undefined;
}

export function MacroRings({
  macros,
  incomplete = false,
  "aria-label": ariaLabel,
}: {
  macros: MacroRingDatum[];
  /** Group label, sourced from the i18n catalog by the caller. */
  "aria-label": string;
  /** Day-level "partial data" flag — see `ProgressRing`'s `incomplete` prop. */
  incomplete?: boolean;
}) {
  return (
    <ul className="grid grid-cols-3 gap-2" aria-label={ariaLabel}>
      {macros.map(({ label, consumed, goal, variant, unit = "г", outcome }) => {
        const safeGoal = goal > 0 ? goal : 0;
        return (
          <li key={label} className="flex flex-col items-center gap-1.5">
            <ProgressRing
              variant={variant}
              value={consumed}
              max={safeGoal || 1}
              size="md"
              incomplete={incomplete}
              aria-label={
                safeGoal > 0
                  ? `${label}: ${consumed} з ${safeGoal} ${unit}`
                  : `${label}: ${consumed} ${unit}`
              }
              label={
                <span className="flex flex-col items-center leading-none gap-0.5">
                  <span className="text-style-label text-text tabular-nums">
                    {consumed}
                  </span>
                  {safeGoal > 0 && (
                    <span className="text-style-caption text-muted tabular-nums">
                      / {safeGoal}
                    </span>
                  )}
                </span>
              }
            />
            <div className="text-center">
              <div className="text-style-caption text-text">{label}</div>
              {outcome && (
                <div className="text-style-caption text-subtle text-pretty">
                  {outcome}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

import {
  ProgressRing,
  type ProgressRingVariant,
} from "@shared/components/ui/ProgressRing";
import { cn } from "@shared/lib/ui/cn";

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
  onHero = false,
  "aria-label": ariaLabel,
}: {
  macros: MacroRingDatum[];
  /** Group label, sourced from the i18n catalog by the caller. */
  "aria-label": string;
  /** Day-level "partial data" flag — see `ProgressRing`'s `incomplete` prop. */
  incomplete?: boolean;
  /**
   * Rendered inside the nutrition hero card. Besides `ProgressRing`'s own
   * `onHero` arc/track swap, this flips the caption stack to the `hero-ink`
   * scale: `text-text`/`text-muted`/`text-subtle` are body-surface tokens
   * and wash out on the saturated hero fill exactly like the rings did.
   */
  onHero?: boolean;
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
              // `sm` (48px) rather than `md` (72px): three fixed-diameter
              // rings at 72px leave <8px of horizontal slack at a 320px
              // viewport once the hero card's own padding is subtracted —
              // any longer caption word or a slightly narrower device
              // tips it into overflow (page-audit nutrition-overview-01).
              // `ProgressRing`'s `size` is a fixed-px enum, not fluid, so
              // shrinking the enum step is the only overflow-safe fix
              // that doesn't fight the shared component with `!important`.
              size="sm"
              incomplete={incomplete}
              onHero={onHero}
              aria-label={
                safeGoal > 0
                  ? `${label}: ${consumed} з ${safeGoal} ${unit}`
                  : `${label}: ${consumed} ${unit}`
              }
              label={
                <span className="flex flex-col items-center leading-none gap-0.5">
                  <span
                    className={cn(
                      "text-style-label tabular-nums",
                      onHero ? "text-hero-ink" : "text-text",
                    )}
                  >
                    {consumed}
                  </span>
                  {safeGoal > 0 && (
                    <span
                      className={cn(
                        "text-style-caption tabular-nums",
                        onHero ? "text-hero-ink/75" : "text-muted",
                      )}
                    >
                      / {safeGoal}
                    </span>
                  )}
                </span>
              }
            />
            <div className="text-center">
              <div
                className={cn(
                  "text-style-caption",
                  onHero ? "text-hero-ink" : "text-text",
                )}
              >
                {label}
              </div>
              {outcome && (
                <div
                  className={cn(
                    "text-style-caption text-pretty",
                    onHero ? "text-hero-ink/75" : "text-subtle",
                  )}
                >
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

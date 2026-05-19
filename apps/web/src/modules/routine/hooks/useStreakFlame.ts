/**
 * useStreakFlame — Routine hero streak flame hook.
 *
 * Derives display properties for the `StreakFlame` XS adornment placed in
 * the top-right corner of `RoutineCalendarHero`. Hides the flame for cold
 * streaks (0 days) and strips the glow animation when the user prefers
 * reduced motion (Hard Rule #17 — one AMBIENT slot; motion-safe wrapper
 * moves glow to CSS, this hook gates render-level decisions).
 *
 * Intensity tiers:
 *   - 0          → not visible (no cold flame shown)
 *   - 1–6        → low    (dim yellow; static icon-only for reduced-motion)
 *   - 7–29       → medium (amber/orange; glow animation enabled)
 *   - 30–99      → strong (red; larger glow radius)
 *   - 100+       → max    (violet; full celebration glow)
 */

import { useReducedMotion } from "@shared/hooks/useReducedMotion";

export type StreakFlameIntensity = "low" | "medium" | "strong" | "max";

export interface UseStreakFlameResult {
  /** Whether the flame adornment should be rendered at all. */
  visible: boolean;
  /** Colour/glow intensity tier passed to `<StreakFlame>`. */
  intensity: StreakFlameIntensity;
  /** Raw streak count (pass-through for `<StreakFlame streak={…}>`) */
  count: number;
  /**
   * When `true` the user prefers reduced motion. Components should omit
   * animation wrappers — `StreakFlame` already uses `motion-safe:` CSS,
   * so this is mainly useful if a wrapper needs to suppress JS-driven
   * effects (e.g. a burst particle).
   */
  reducedMotion: boolean;
}

function resolveIntensity(streakDays: number): StreakFlameIntensity {
  if (streakDays >= 100) return "max";
  if (streakDays >= 30) return "strong";
  if (streakDays >= 7) return "medium";
  return "low";
}

/**
 * @param streakDays - Current consecutive-day streak. 0 hides the flame.
 */
export function useStreakFlame(streakDays: number): UseStreakFlameResult {
  const reducedMotion = useReducedMotion();

  return {
    visible: streakDays > 0,
    intensity: resolveIntensity(streakDays),
    count: streakDays,
    reducedMotion,
  };
}

/**
 * Last validated: 2026-08-01
 * Status: Active
 *
 * Bounds for the free-form numeric fields of a workout item.
 *
 * These inputs write straight into the workout store with `Number(value)`,
 * so `Infinity`, `NaN` and a pasted 20-digit number would reach storage,
 * sync and every downstream volume aggregate. The ceilings are absurdity
 * guards, not training advice — a 1000 kg lift is not a real set, it is a
 * typo.
 */

export const MAX_WEIGHT_KG = 1000;
export const MAX_REPS = 1000;
/** 24 години — довша «вправа» точно не вправа. */
export const MAX_DURATION_SEC = 86_400;
/** 1000 км. */
export const MAX_DISTANCE_M = 1_000_000;

/**
 * Parse a numeric input value into a finite number within `[0; max]`.
 * Empty / unparseable input reads as `0`, matching how these fields
 * already treat a cleared value.
 */
export function clampNumericInput(raw: string, max: number): number {
  if (raw === "") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value > max ? max : value;
}

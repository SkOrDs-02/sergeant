/**
 * Pure helpers backing the mobile active-set editor (Phase 6).
 *
 * The editor exposes weight / reps / RPE fields per set; mutations
 * route through the reducers in this module so validation, step
 * rounding and clamping live on the pure side and can be covered by
 * vitest without a React host.
 *
 * Conventions:
 *   - Weight is measured in kilograms, nudged in 2.5 kg steps (the
 *     smallest common plate pair on a standard Olympic bar).
 *   - Reps are whole integers ≥ 0.
 *   - RPE uses Borg 1..10. `null` / `undefined` means "not provided".
 *   - All helpers are immutable — they return a new draft object.
 */

import type {
  WorkoutSet,
  WorkoutSetDraft,
  WorkoutSetDraftErrors,
} from "./types.js";

/** Default 2.5 kg plate pair step. */
export const WEIGHT_STEP_KG = 2.5;

/** Lower / upper RPE bounds (Borg CR-10). */
export const RPE_MIN = 1;
export const RPE_MAX = 10;

/** Sensible upper guards so a fat-fingered entry cannot overflow UI. */
export const MAX_WEIGHT_KG = 1000;
export const MAX_REPS = 999;

function toFiniteNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Fresh draft with zeroed weight / reps and no RPE. */
export function createEmptySetDraft(): WorkoutSetDraft {
  return { weightKg: 0, reps: 0, rpe: null };
}

/**
 * Round a kilogram value to the nearest 2.5 kg step, clamped to the
 * [0, MAX_WEIGHT_KG] range. NaN-safe.
 */
export function snapWeightKg(
  value: number,
  step: number = WEIGHT_STEP_KG,
): number {
  const n = toFiniteNumber(value, 0);
  const s = step > 0 ? step : WEIGHT_STEP_KG;
  const snapped = Math.round(n / s) * s;
  const bounded = Math.min(MAX_WEIGHT_KG, Math.max(0, snapped));
  // Avoid -0 and trailing floating-point grit.
  return Math.round(bounded * 100) / 100;
}

/** Clamp reps to a whole integer in `[0, MAX_REPS]`. */
export function snapReps(value: number): number {
  const n = Math.round(toFiniteNumber(value, 0));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_REPS, Math.max(0, n));
}

/** Clamp RPE to Borg 1..10, returning `null` for out-of-range / unset. */
export function clampRpe(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(RPE_MAX, Math.max(RPE_MIN, Math.round(n * 2) / 2));
  return clamped;
}

/**
 * Increment the weight of the draft by `step` kg, snapping the
 * result to the grid. Pure; returns a new draft.
 */
export function incrementWeight(
  draft: WorkoutSetDraft,
  step: number = WEIGHT_STEP_KG,
): WorkoutSetDraft {
  return {
    ...draft,
    weightKg: snapWeightKg(draft.weightKg + step, step),
  };
}

/** Decrement the weight, never going below `0`. */
export function decrementWeight(
  draft: WorkoutSetDraft,
  step: number = WEIGHT_STEP_KG,
): WorkoutSetDraft {
  return {
    ...draft,
    weightKg: snapWeightKg(draft.weightKg - step, step),
  };
}

export function incrementReps(draft: WorkoutSetDraft): WorkoutSetDraft {
  return { ...draft, reps: snapReps(draft.reps + 1) };
}

export function decrementReps(draft: WorkoutSetDraft): WorkoutSetDraft {
  return { ...draft, reps: snapReps(draft.reps - 1) };
}

/** Set a raw weight value; caller passes a snapped or raw number. */
export function setWeightKg(
  draft: WorkoutSetDraft,
  value: number,
): WorkoutSetDraft {
  return { ...draft, weightKg: snapWeightKg(value) };
}

export function setReps(
  draft: WorkoutSetDraft,
  value: number,
): WorkoutSetDraft {
  return { ...draft, reps: snapReps(value) };
}

/** Assign RPE (or clear it with `null`). Out-of-range → `null`. */
export function setRpe(
  draft: WorkoutSetDraft,
  value: number | null | undefined,
): WorkoutSetDraft {
  return { ...draft, rpe: clampRpe(value) };
}

/**
 * Validate a set draft. Returns an empty object when the draft is
 * submission-ready. Both weight *and* reps must be strictly positive
 * — a set with `0 kg × 0 reps` is treated as empty and rejected at
 * the form level so the user does not accidentally log a phantom
 * set.
 */
export function validateSetDraft(
  draft: WorkoutSetDraft,
): WorkoutSetDraftErrors {
  const errors: WorkoutSetDraftErrors = {};
  const weight = toFiniteNumber(draft.weightKg, NaN);
  const reps = toFiniteNumber(draft.reps, NaN);
  if (!Number.isFinite(weight) || weight < 0 || weight > MAX_WEIGHT_KG) {
    errors.weightKg = `0…${MAX_WEIGHT_KG} кг`;
  }
  if (!Number.isFinite(reps) || reps < 0 || reps > MAX_REPS) {
    errors.reps = `0…${MAX_REPS}`;
  } else if (!Number.isInteger(reps)) {
    errors.reps = "Ціле число";
  }
  if (draft.rpe != null) {
    const n = Number(draft.rpe);
    if (!Number.isFinite(n) || n < RPE_MIN || n > RPE_MAX) {
      errors.rpe = `${RPE_MIN}…${RPE_MAX}`;
    }
  }
  // A set with *both* weight and reps at 0 carries no signal.
  if (!errors.weightKg && !errors.reps) {
    if ((draft.weightKg || 0) <= 0 && (draft.reps || 0) <= 0) {
      errors.reps = errors.reps || "Заповни кг або повт.";
    }
  }
  return errors;
}

export function isSetDraftValid(errors: WorkoutSetDraftErrors): boolean {
  return !errors.weightKg && !errors.reps && !errors.rpe;
}

/** Round-trip a persisted `WorkoutSet` back to a draft. */
export function setToDraft(set: WorkoutSet): WorkoutSetDraft {
  const rpeRaw = (set as { rpe?: number | null }).rpe;
  return {
    weightKg: toFiniteNumber(set.weightKg, 0),
    reps: toFiniteNumber(set.reps, 0),
    rpe: clampRpe(rpeRaw),
  };
}

/**
 * Flatten a validated draft back to the persisted `WorkoutSet`.
 * RPE is omitted when the draft has it as null/undefined so legacy
 * writes stay backward-compatible with the existing schema.
 */
export function draftToSet(draft: WorkoutSetDraft): WorkoutSet {
  const out: WorkoutSet & { rpe?: number } = {
    weightKg: snapWeightKg(draft.weightKg),
    reps: snapReps(draft.reps),
  };
  const rpe = clampRpe(draft.rpe);
  if (rpe != null) {
    (out as { rpe?: number }).rpe = rpe;
  }
  return out;
}

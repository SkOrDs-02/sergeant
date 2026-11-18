/**
 * План «підходи × повтори» для вправи сесії програми.
 *
 * ⚠️ Інженерний дефолт, РАТИФІКУВАТИ ОКРЕМО (рішення власника 2026-11-18,
 * П-8 (Б), OD-32): числа не founder-ові. Підходів `PROGRAM_DEFAULT_SETS`,
 * повтори — діапазон вправи з `TARGET_REP_RANGES` через `targetRepRange`
 * (одна таблиця на весь домен, та сама, що веде підказку наступного підходу).
 * Сесія може нести власний план (`ProgramSessionDef.plan`) лише тоді, коли
 * число назване в описі самої програми: «Силовий 5×5» і «Лінійна прогресія».
 */

import {
  targetRepRange,
  type ExerciseProgressionHint,
} from "../../lib/workoutStats.js";
import type { ProgramSessionDef } from "./types.js";

/** Підходів на вправу за замовчуванням. ⚠️ Ратифікувати окремо (П-8). */
export const PROGRAM_DEFAULT_SETS = 3;

export interface ProgramExercisePlan {
  readonly sets: number;
  readonly repsMin: number;
  readonly repsMax: number;
}

export function programExercisePlan(
  session: Pick<ProgramSessionDef, "plan">,
  exercise: ExerciseProgressionHint | null | undefined,
): ProgramExercisePlan {
  if (session.plan) {
    return {
      sets: session.plan.sets,
      repsMin: session.plan.reps,
      repsMax: session.plan.reps,
    };
  }
  const range = targetRepRange(exercise);
  return {
    sets: PROGRAM_DEFAULT_SETS,
    repsMin: range.min,
    repsMax: range.max,
  };
}

/** «3×5–8» або «5×5», коли повтори фіксовані. */
export function formatProgramExercisePlan(plan: ProgramExercisePlan): string {
  const reps =
    plan.repsMin === plan.repsMax
      ? String(plan.repsMin)
      : `${plan.repsMin}–${plan.repsMax}`;
  return `${plan.sets}×${reps}`;
}

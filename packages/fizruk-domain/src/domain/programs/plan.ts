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
  type TargetRepRange,
} from "../../lib/workoutStats.js";
import type { WorkoutProgramRef } from "../types.js";
import { findProgramById } from "./selectors.js";
import type { ProgramSessionDef } from "./types.js";

/** Підходів на вправу за замовчуванням. ⚠️ Ратифікувати окремо (П-8). */
export const PROGRAM_DEFAULT_SETS = 3;

/**
 * Клас вправи, що міряється часом, а не повтореннями: `hold` — статичне
 * утримання (планка, «човник», стілець біля стіни, віс), `carry` — переноска
 * (хода фермера).
 */
export type ProgramTimedClass = "hold" | "carry";

export interface SecondsRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Секунди одного підходу для класу вправ на час.
 *
 * ⚠️ ДЕФОЛТ ЗА ДОРУЧЕННЯМ FOUNDER-А 2026-11-18, РАТИФІКУВАТИ ОКРЕМО («придумай
 * дефолти сам», § 11.9 розбору). Помірні загальноприйняті значення: утримання
 * 20–40 с, переноска 30–60 с. Одне число на клас, а не на вправу.
 */
export const PROGRAM_TIMED_SEC_RANGES = {
  hold: { min: 20, max: 40 },
  carry: { min: 30, max: 60 },
} as const satisfies Record<ProgramTimedClass, SecondsRange>;

/**
 * Вправи каталогу програм, що міряються часом. Лише ті, що стоять у
 * `PROGRAM_CATALOGUE`: загальний тип виміру вправи — окрема спека
 * (`fizruk-exercise-measure-type.md`).
 */
export const PROGRAM_TIMED_EXERCISES: Readonly<
  Record<string, ProgramTimedClass>
> = {
  plank: "hold",
  hollow_hold: "hold",
  wall_sit: "hold",
  dead_hang: "hold",
  farmers_walk: "carry",
};

/**
 * План вправи сесії. `reps` — підходи × повтори; `time` — підходи × секунди.
 * Вправа на час у сесії — item типу `time` з однією сумарною тривалістю:
 * секунд на підхід модель даних не має (спека типу виміру).
 */
export type ProgramExercisePlan =
  | {
      readonly kind: "reps";
      readonly sets: number;
      readonly repsMin: number;
      readonly repsMax: number;
    }
  | {
      readonly kind: "time";
      readonly sets: number;
      readonly secMin: number;
      readonly secMax: number;
    };

export type ProgramPlanExercise = ExerciseProgressionHint & {
  readonly id?: string | null | undefined;
};

export function programExercisePlan(
  session: Pick<ProgramSessionDef, "plan">,
  exercise: ProgramPlanExercise | null | undefined,
): ProgramExercisePlan {
  const timed = exercise?.id ? PROGRAM_TIMED_EXERCISES[exercise.id] : undefined;
  if (timed) {
    const range = PROGRAM_TIMED_SEC_RANGES[timed];
    return {
      kind: "time",
      sets: PROGRAM_DEFAULT_SETS,
      secMin: range.min,
      secMax: range.max,
    };
  }
  if (session.plan) {
    return {
      kind: "reps",
      sets: session.plan.sets,
      repsMin: session.plan.reps,
      repsMax: session.plan.reps,
    };
  }
  const range = targetRepRange(exercise);
  return {
    kind: "reps",
    sets: PROGRAM_DEFAULT_SETS,
    repsMin: range.min,
    repsMax: range.max,
  };
}

function formatRange(min: number, max: number): string {
  return min === max ? String(min) : `${min}–${max}`;
}

/** «3×5–8», «5×5» або «3×20–40 с». */
export function formatProgramExercisePlan(plan: ProgramExercisePlan): string {
  return plan.kind === "time"
    ? `${plan.sets}×${formatRange(plan.secMin, plan.secMax)} с`
    : `${plan.sets}×${formatRange(plan.repsMin, plan.repsMax)}`;
}

/** План вправи в сесії програми, з якої стартувало тренування (П-10). */
export function programPlanForWorkoutItem(
  ref: WorkoutProgramRef | null | undefined,
  exercise: ProgramPlanExercise | null | undefined,
): ProgramExercisePlan | null {
  if (!ref) return null;
  const program = findProgramById(ref.programId);
  const entry = program?.schedule[ref.slot];
  const session = entry ? program?.sessions[entry.sessionKey] : undefined;
  return session ? programExercisePlan(session, exercise) : null;
}

/**
 * Повтори з власного плану сесії, з якої стартувало тренування (5×5 → 5–5).
 * `null`, коли сесія плану не має чи привʼязку не розібрати: тоді підказка
 * бере діапазон каталогу, той самий, що й дефолт плану.
 */
export function programPlanTargetReps(
  ref: WorkoutProgramRef | null | undefined,
): TargetRepRange | null {
  if (!ref) return null;
  const program = findProgramById(ref.programId);
  const entry = program?.schedule[ref.slot];
  const plan = entry ? program?.sessions[entry.sessionKey]?.plan : undefined;
  return plan ? { min: plan.reps, max: plan.reps } : null;
}

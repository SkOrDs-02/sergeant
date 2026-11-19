import {
  measureToItemType,
  resolveExerciseMeasure,
  type ExerciseMeasure,
  type ExerciseMeasurePrefs,
  type MeasureExerciseLike,
  type WorkoutItemType,
} from "@sergeant/fizruk-domain";

export interface ExerciseItemSeed {
  measure: ExerciseMeasure;
  type: WorkoutItemType;
  sets: { weightKg: number; reps: number }[];
  durationSec: number;
  distanceM: number;
}

/**
 * Поля нової вправи в сесії за її типом виміру (спека
 * `fizruk-exercise-measure-type.md`): памʼять людини → дефолт каталогу.
 * Замінює евристику `primaryGroup === "cardio"`, що жила в чотирьох місцях.
 * Старий `type` пишеться поруч як дзеркало для старих читачів.
 */
export function exerciseItemSeed(
  exercise: MeasureExerciseLike | null | undefined,
  prefs?: ExerciseMeasurePrefs | null,
): ExerciseItemSeed {
  const measure = resolveExerciseMeasure(exercise, prefs);
  const type = measureToItemType(measure);
  return {
    measure,
    type,
    // Один порожній рядок підходу для будь-якого типу (зріз 4): утримання й
    // дистанція записуються підходами, а не одним числом на вправу.
    sets: [{ weightKg: 0, reps: 0 }],
    durationSec: 0,
    distanceM: 0,
  };
}

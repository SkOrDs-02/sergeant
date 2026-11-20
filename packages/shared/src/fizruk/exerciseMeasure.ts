/**
 * Тип виміру вправи Фізрука: перелік і межі одного підходу — спільне джерело
 * для домену (`@sergeant/fizruk-domain`, `measure.ts`) і серверного
 * sync-хендлера (`apps/server/src/modules/sync/fizruk/setMeasureFields.ts`),
 * за зразком `measurementBounds.ts`.
 *
 * Перелік — рішення founder-а 2026-11-18 (Б-1, набір А; спека
 * `docs/work/specs/fizruk-exercise-measure-type.md`). Postgres CHECK
 * (міграції 172, 173) перевіряє лише форму ідентифікатора, тож новий тип —
 * правка цього масиву, а не міграція.
 */

export const EXERCISE_MEASURES = [
  "weight_reps",
  "reps",
  "weight_time",
  "time",
  "weight_distance",
  "distance_time",
] as const;

export type ExerciseMeasure = (typeof EXERCISE_MEASURES)[number];

const MEASURE_SET: ReadonlySet<string> = new Set(EXERCISE_MEASURES);

export function isExerciseMeasure(v: unknown): v is ExerciseMeasure {
  return typeof v === "string" && MEASURE_SET.has(v);
}

/**
 * Межі секунд і метрів ОДНОГО підходу. Числа дзеркалять стелі форми вправи
 * (`apps/web/src/modules/fizruk/lib/numericBounds.ts`: `MAX_DURATION_SEC`,
 * `MAX_DISTANCE_M`) — це захист від друкарської помилки, а не порада.
 */
export const WORKOUT_SET_DURATION_SEC_BOUNDS = { min: 0, max: 86_400 } as const;
export const WORKOUT_SET_DISTANCE_M_BOUNDS = {
  min: 0,
  max: 1_000_000,
} as const;

/**
 * Тип підходу Фізрука (міграція 176, спека
 * `docs/work/specs/fizruk-set-done-flag-and-set-type.md`). NULL / відсутнє
 * поле = звичайний підхід, тож «звичайного» в переліку немає. Postgres CHECK
 * перевіряє лише форму ідентифікатора; перелік тримає цей масив (домен і
 * серверний sync-хендлер, `invalid_set_type`).
 *
 * Семантика — рішення власника 2026-11-19 (П-Фз3-1…3): розминка поза
 * результатом (обʼєм, рекорди, зараховані підходи), але в навантаженні
 * відновлення; дроп і «до відмови» — лише позначка, рахуються як звичайні.
 */
export const WORKOUT_SET_TYPES = ["warmup", "drop", "failure"] as const;

export type WorkoutSetType = (typeof WORKOUT_SET_TYPES)[number];

const SET_TYPE_SET: ReadonlySet<string> = new Set(WORKOUT_SET_TYPES);

export function isWorkoutSetType(v: unknown): v is WorkoutSetType {
  return typeof v === "string" && SET_TYPE_SET.has(v);
}

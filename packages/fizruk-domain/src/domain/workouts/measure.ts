/**
 * Тип виміру вправи: як міряється підхід (спека
 * `docs/work/specs/fizruk-exercise-measure-type.md`).
 *
 * AI-CONTEXT: перелік — рішення founder-а 2026-11-18 (Б-1, набір А, § 11.9
 * розбору `2026-11-17-modules-teardown-vs-leaders.md`): шість типів «за
 * виміром». Ідентифікатори — стабільні рядки латиницею, бо їдуть у sync і
 * БД (`fizruk_workout_items.measure`, `fizruk_exercise_prefs.measure`); CHECK
 * у Postgres перевіряє лише форму, перелік тримає цей масив.
 *
 * Старі записи типу виміру не мають: `itemMeasure` виводить його зі старого
 * `type` (`strength` → вага × повтори, `time` → час, `distance` → дистанція ×
 * час), тож історія читається без міграції даних.
 */

import { isExerciseMeasure, type ExerciseMeasure } from "@sergeant/shared";

import type { WorkoutItemType } from "../types.js";

export {
  EXERCISE_MEASURES,
  isExerciseMeasure,
  type ExerciseMeasure,
} from "@sergeant/shared";

/** Вибір людини: id вправи → тип (памʼять, що їде між пристроями). */
export type ExerciseMeasurePrefs = Readonly<
  Record<string, ExerciseMeasure | undefined>
>;

/** Яка величина робить підхід зарахованим. */
export type MeasureCountDimension = "reps" | "time" | "distance";

export interface MeasureFields {
  readonly weight: boolean;
  readonly reps: boolean;
  readonly time: boolean;
  readonly distance: boolean;
}

export interface MeasureExerciseLike {
  readonly id?: string | null | undefined;
  readonly measure?: unknown;
  readonly primaryGroup?: string | null | undefined;
}

/**
 * Дефолт вправи: поле `measure` каталогу чи власної вправи; без нього —
 * евристика, що жила в чотирьох місцях вебу (`cardio` → дистанція × час),
 * інакше вага × повтори.
 */
export function catalogMeasure(
  exercise: MeasureExerciseLike | null | undefined,
): ExerciseMeasure {
  if (isExerciseMeasure(exercise?.measure)) return exercise.measure;
  if (exercise?.primaryGroup === "cardio") return "distance_time";
  return "weight_reps";
}

/** Тип для старту вправи: памʼять людини → дефолт вправи (рішення Р-2). */
export function resolveExerciseMeasure(
  exercise: MeasureExerciseLike | null | undefined,
  prefs?: ExerciseMeasurePrefs | null,
): ExerciseMeasure {
  const id = exercise?.id;
  const remembered = id && prefs ? prefs[id] : undefined;
  if (isExerciseMeasure(remembered)) return remembered;
  return catalogMeasure(exercise);
}

/** Старий `type` item-а, який пишеться поруч як дзеркало для старих читачів. */
export function measureToItemType(m: ExerciseMeasure): WorkoutItemType {
  switch (m) {
    case "time":
    case "weight_time":
      return "time";
    case "weight_distance":
    case "distance_time":
      return "distance";
    default:
      return "strength";
  }
}

export interface MeasureItemLike {
  readonly measure?: unknown;
  readonly type?: string | null | undefined;
}

/** Тип записаної вправи; записи до фічі — зі старого `type`. */
export function itemMeasure(
  item: MeasureItemLike | null | undefined,
): ExerciseMeasure {
  if (isExerciseMeasure(item?.measure)) return item.measure;
  if (item?.type === "time") return "time";
  if (item?.type === "distance") return "distance_time";
  return "weight_reps";
}

/** Чи тип записаний явно (запис після фічі), а не виведений зі старого `type`. */
export function hasExplicitMeasure(
  item: MeasureItemLike | null | undefined,
): boolean {
  return isExerciseMeasure(item?.measure);
}

export function measureFields(m: ExerciseMeasure): MeasureFields {
  return {
    weight:
      m === "weight_reps" || m === "weight_time" || m === "weight_distance",
    reps: m === "weight_reps" || m === "reps",
    time: m === "weight_time" || m === "time" || m === "distance_time",
    distance: m === "weight_distance" || m === "distance_time",
  };
}

/**
 * Лічильна величина: підхід зараховано, коли вона > 0, друга (вага, час на
 * дистанції) може бути нульовою — продовження правила `isSetCompleted`.
 */
export function measureCountsBy(m: ExerciseMeasure): MeasureCountDimension {
  if (m === "weight_reps" || m === "reps") return "reps";
  if (m === "weight_time" || m === "time") return "time";
  return "distance";
}

/** Обʼєм `кг×повт` рахується лише для ваги × повтори (канон 2026-09-13). */
export function measureHasVolume(m: ExerciseMeasure): boolean {
  return m === "weight_reps";
}

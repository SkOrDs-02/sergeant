/**
 * Поля типу виміру в рядках `fizruk_workout_sets` і `fizruk_workout_items`
 * (міграція 172, спека `docs/work/specs/fizruk-exercise-measure-type.md`)
 * і явний прапорець «виконано» з типом підходу (міграція 176,
 * `parseSetDoneFields`).
 *
 * AI-DANGER: прапорець присутності, а не значення. Старий клієнт (і
 * мобілка на паузі) шле рядок без ключів `duration_sec` / `distance_m` /
 * `measure`; UPDATE з `CASE WHEN $present THEN $value ELSE <колонка> END`
 * не затирає записане новим клієнтом — той самий прийом, що `program_id`
 * (міграція 171). Ключ присутній зі значенням `null` = свідоме очищення.
 *
 * Винесено з `applySync.ts` (ліміт 600 рядків).
 */

import {
  isExerciseMeasure,
  isWorkoutSetType,
  WORKOUT_SET_DISTANCE_M_BOUNDS,
  WORKOUT_SET_DURATION_SEC_BOUNDS,
} from "@sergeant/shared";
import { parseOptionalBoundedInt } from "../syncV2-core.js";

export interface PresentColumn<T> {
  readonly present: boolean;
  readonly value: T | null;
}

function has(row: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, key);
}

function boundedColumn(
  row: Record<string, unknown>,
  key: string,
  bounds: { readonly min: number; readonly max: number },
): PresentColumn<number> | "invalid" {
  if (!has(row, key)) return { present: false, value: null };
  const v = parseOptionalBoundedInt(row[key], bounds);
  if (v === "invalid") return "invalid";
  return { present: true, value: v };
}

export type SetMeasureFields =
  | {
      readonly durationSec: PresentColumn<number>;
      readonly distanceM: PresentColumn<number>;
    }
  | { readonly reject: "invalid_duration_sec" | "invalid_distance_m" };

/** Секунди й метри одного підходу з межами `WORKOUT_SET_*_BOUNDS`. */
export function parseSetMeasureFields(
  row: Record<string, unknown>,
): SetMeasureFields {
  const durationSec = boundedColumn(
    row,
    "duration_sec",
    WORKOUT_SET_DURATION_SEC_BOUNDS,
  );
  if (durationSec === "invalid") return { reject: "invalid_duration_sec" };
  const distanceM = boundedColumn(
    row,
    "distance_m",
    WORKOUT_SET_DISTANCE_M_BOUNDS,
  );
  if (distanceM === "invalid") return { reject: "invalid_distance_m" };
  return { durationSec, distanceM };
}

/**
 * Тип виміру вправи. Значення поза `EXERCISE_MEASURES` відкидається
 * (`invalid_measure`), як `chosen_variant`: CHECK у БД перевіряє лише форму.
 */
export function parseItemMeasure(
  row: Record<string, unknown>,
): PresentColumn<string> | "invalid" {
  if (!has(row, "measure")) return { present: false, value: null };
  const v = row["measure"];
  if (v === null || v === undefined) return { present: true, value: null };
  return isExerciseMeasure(v) ? { present: true, value: v } : "invalid";
}

export type SetDoneFields =
  | {
      readonly done: PresentColumn<boolean>;
      readonly setType: PresentColumn<string>;
    }
  | { readonly reject: "invalid_done" | "invalid_set_type" };

/**
 * Явний прапорець «виконано» і тип підходу (міграція 176, спека
 * `docs/work/specs/fizruk-set-done-flag-and-set-type.md`). Той самий
 * прапорець присутності: ключа немає — колонка не змінюється, `null` —
 * свідоме очищення (NULL = «як до фічі»).
 *
 * `done`: JSON `true` / `false` або `1` / `0` (клієнтський SQLite тримає
 * прапорець як INTEGER, конвенція `readBoolField`; ті самі форми приймає
 * бекфіл 176). Інше значення — `invalid_done`, а не тихе `false`: хибне
 * «не виконано» вибило б підхід з підрахунків.
 *
 * `set_type`: лише `WORKOUT_SET_TYPES` (`@sergeant/shared`); інше —
 * `invalid_set_type`, як `measure` (172): CHECK у БД перевіряє лише форму.
 */
export function parseSetDoneFields(
  row: Record<string, unknown>,
): SetDoneFields {
  let done: PresentColumn<boolean> = { present: false, value: null };
  if (has(row, "done")) {
    const v = row["done"];
    if (v === null || v === undefined) done = { present: true, value: null };
    else if (v === true || v === 1) done = { present: true, value: true };
    else if (v === false || v === 0) done = { present: true, value: false };
    else return { reject: "invalid_done" };
  }
  let setType: PresentColumn<string> = { present: false, value: null };
  if (has(row, "set_type")) {
    const v = row["set_type"];
    if (v === null || v === undefined) setType = { present: true, value: null };
    else if (isWorkoutSetType(v)) setType = { present: true, value: v };
    else return { reject: "invalid_set_type" };
  }
  return { done, setType };
}

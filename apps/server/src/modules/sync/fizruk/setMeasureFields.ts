/**
 * Поля типу виміру в рядках `fizruk_workout_sets` і `fizruk_workout_items`
 * (міграція 172, спека `docs/work/specs/fizruk-exercise-measure-type.md`).
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

/**
 * Рядок `fizruk_workout_sets` → `WorkoutSet` (винесено з `sqliteReader.ts`,
 * ліміт 600 рядків). Секунди й метри підходу — колонки міграції 172 /
 * клієнтської 010 (спека `fizruk-exercise-measure-type.md`); NULL = підхід
 * без цієї величини, поле в обʼєкт не потрапляє.
 *
 * Прапорець «виконано» і тип підходу — колонки міграції 176 / клієнтської
 * 012 (спека `fizruk-set-done-flag-and-set-type.md`). SQLite тримає `done`
 * як 1 / 0 / NULL, а generic-гілка pull-а може записати те, що прислав
 * сервер (boolean); обидва читаються. NULL — запис до фічі: поле в обʼєкт
 * не потрапляє, тож `isSetCompleted` бере чинне правило і старі числа не
 * рухаються. Тип поза переліком читається як звичайний.
 */

import type { WorkoutSet } from "@sergeant/fizruk-domain";
import { isWorkoutSetType } from "@sergeant/shared";

export interface WorkoutSetRow {
  id: string;
  workout_item_id: string;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  duration_sec?: number | null;
  distance_m?: number | null;
  done?: number | boolean | null;
  set_type?: string | null;
  sort_order: number | null;
  [key: string]: unknown;
}

export const WORKOUT_SETS_SELECT_SQL = `SELECT id, workout_item_id, weight_kg, reps, rpe,
              duration_sec, distance_m, done, set_type, sort_order
         FROM fizruk_workout_sets
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY workout_item_id ASC, sort_order ASC, id ASC`;

function doneFromColumn(v: unknown): boolean | null {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  return null;
}

export function rowToWorkoutSet(row: WorkoutSetRow): WorkoutSet {
  const done = doneFromColumn(row.done);
  return {
    weightKg: row.weight_kg ?? 0,
    reps: row.reps ?? 0,
    ...(row.rpe != null ? { rpe: row.rpe } : {}),
    ...(row.duration_sec != null ? { durationSec: row.duration_sec } : {}),
    ...(row.distance_m != null ? { distanceM: row.distance_m } : {}),
    ...(done !== null ? { done } : {}),
    ...(isWorkoutSetType(row.set_type) ? { setType: row.set_type } : {}),
  };
}

/**
 * Рядок `fizruk_workout_sets` → `WorkoutSet` (винесено з `sqliteReader.ts`,
 * ліміт 600 рядків). Секунди й метри підходу — колонки міграції 172 /
 * клієнтської 010 (спека `fizruk-exercise-measure-type.md`); NULL = підхід
 * без цієї величини, поле в обʼєкт не потрапляє.
 */

import type { WorkoutSet } from "@sergeant/fizruk-domain";

export interface WorkoutSetRow {
  id: string;
  workout_item_id: string;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  duration_sec?: number | null;
  distance_m?: number | null;
  sort_order: number | null;
  [key: string]: unknown;
}

export const WORKOUT_SETS_SELECT_SQL = `SELECT id, workout_item_id, weight_kg, reps, rpe,
              duration_sec, distance_m, sort_order
         FROM fizruk_workout_sets
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY workout_item_id ASC, sort_order ASC, id ASC`;

export function rowToWorkoutSet(row: WorkoutSetRow): WorkoutSet {
  return {
    weightKg: row.weight_kg ?? 0,
    reps: row.reps ?? 0,
    ...(row.rpe != null ? { rpe: row.rpe } : {}),
    ...(row.duration_sec != null ? { durationSec: row.duration_sec } : {}),
    ...(row.distance_m != null ? { distanceM: row.distance_m } : {}),
  };
}

/**
 * Рядки `fizruk_exercise_prefs` → памʼять типу виміру вправи (винесено з
 * `sqliteReader.ts`, ліміт 600 рядків). Міграція 173 / клієнтська 011,
 * спека `fizruk-exercise-measure-type.md`, зріз 5. Незнайомий тип (новіший
 * клієнт → старіший) пропускається: вправа стартує з дефолту каталогу.
 */

import {
  isExerciseMeasure,
  type ExerciseMeasure,
} from "@sergeant/fizruk-domain/domain";

export interface ExercisePrefRow {
  id: string;
  measure: string | null;
  [key: string]: unknown;
}

export const EXERCISE_PREFS_SELECT_SQL = `SELECT id, measure
         FROM fizruk_exercise_prefs
        WHERE user_id = ? AND deleted_at IS NULL`;

export function rowsToExercisePrefs(
  rows: readonly ExercisePrefRow[],
): Record<string, ExerciseMeasure> {
  const out: Record<string, ExerciseMeasure> = {};
  for (const row of rows) {
    if (row.id && isExerciseMeasure(row.measure)) out[row.id] = row.measure;
  }
  return out;
}

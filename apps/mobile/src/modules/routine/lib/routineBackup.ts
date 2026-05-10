/**
 * Mobile Routine — backup payload helpers.
 *
 * Stage 13 PR #071 of `docs/planning/storage-roadmap.md` — mirror of
 * `apps/web/src/modules/routine/lib/routineStorage.ts`'s
 * `buildRoutineBackupPayload()` / `applyRoutineBackupPayload()` so the
 * mobile hub backup can delegate (instead of reaching into the now-empty
 * `STORAGE_KEYS.ROUTINE` MMKV slot directly). Read-side hits the SQLite
 * warm cache via `loadRoutineState()`; write-side fires
 * `saveRoutineState()` which triggers the dual-write pipeline with a
 * fresh `Date.now()` clientTs.
 */

import {
  ROUTINE_SCHEMA_VERSION,
  ensureHabitOrder,
  normalizeRoutineState,
  type RoutineState,
} from "@sergeant/routine-domain";

import { loadRoutineState, saveRoutineState } from "./routineStore";

export const ROUTINE_BACKUP_KIND = "hub-routine-backup";

export interface RoutineBackupPayload {
  kind: typeof ROUTINE_BACKUP_KIND;
  schemaVersion: number;
  exportedAt: string;
  data: RoutineState;
}

/**
 * Build a JSON-serializable backup payload. Reads from the SQLite warm
 * cache (populated at boot by `useRoutineSqliteReadBoot`); pre-boot the
 * loader returns `defaultRoutineState()` so the payload still has a
 * sensible shape.
 */
export function buildRoutineBackupPayload(): RoutineBackupPayload {
  return {
    kind: ROUTINE_BACKUP_KIND,
    schemaVersion: ROUTINE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: loadRoutineState(),
  };
}

/**
 * Apply a Routine backup payload. Validates the wrapper, normalizes the
 * inner `data` blob, and persists via `saveRoutineState()` which
 * triggers the dual-write pipeline (warm cache + SQLite tables).
 */
export function applyRoutineBackupPayload(parsed: unknown): void {
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { kind?: unknown }).kind !== ROUTINE_BACKUP_KIND ||
    !(parsed as { data?: unknown }).data ||
    typeof (parsed as { data?: unknown }).data !== "object"
  ) {
    throw new Error("Некоректний файл резервної копії Рутини.");
  }
  const d = (parsed as { data: unknown }).data;
  const merged = normalizeRoutineState(d);
  const { state } = ensureHabitOrder(merged);
  if (!saveRoutineState(state)) {
    throw new Error(
      "Не вдалося записати дані після імпорту (наприклад, переповнення сховища).",
    );
  }
}

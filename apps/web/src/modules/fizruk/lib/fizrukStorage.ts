/**
 * Web-only обгортка над localStorage для Фізрука. Усі pure-шматки
 * (ключі, schema-версії, parse/serialize/merge, payload shape guards)
 * живуть у пакеті `@sergeant/fizruk-domain` або в `fizrukBackupShape.ts`;
 * цей файл лише додає персист через `createModuleStorage` для apps/web
 * та зшиває pure-валідатори з I/O-викликами.
 */

import {
  CUSTOM_EXERCISES_KEY,
  FIZRUK_FULL_BACKUP_KEYS,
  WORKOUTS_STORAGE_KEY,
  mergeCustomById,
  mergeWorkoutsById,
  parseCustomExercisesFromStorage,
  parseWorkoutsFromStorage,
  serializeCustomExercisesToStorage,
  serializeWorkoutsToStorage,
} from "@sergeant/fizruk-domain";

import { fizrukStorage } from "./fizrukStorageInstance";
import {
  assertFizrukBackupShape,
  type FizrukBackupPayload,
} from "./fizrukBackupShape";

export {
  ACTIVE_WORKOUT_KEY,
  CUSTOM_EXERCISES_KEY,
  CUSTOM_SCHEMA_VERSION,
  FIZRUK_FULL_BACKUP_KEYS,
  FIZRUK_RESET_KEYS,
  MEASUREMENTS_STORAGE_KEY,
  MONTHLY_PLAN_STORAGE_KEY,
  PLAN_TEMPLATE_STORAGE_KEY,
  SELECTED_TEMPLATE_STORAGE_KEY,
  TEMPLATES_STORAGE_KEY,
  WORKOUTS_SCHEMA_VERSION,
  WORKOUTS_STORAGE_KEY,
  mergeCustomById,
  mergeWorkoutsById,
  parseCustomExercisesFromStorage,
  parseWorkoutsFromStorage,
  serializeCustomExercisesToStorage,
  serializeWorkoutsToStorage,
} from "@sergeant/fizruk-domain";

const storage = fizrukStorage;

/** Full backup blob for export/import. */
export function buildFizrukBackupPayload() {
  const workoutsRaw = storage.readRaw(WORKOUTS_STORAGE_KEY, null);
  const customRaw = storage.readRaw(CUSTOM_EXERCISES_KEY, null);
  return {
    kind: "fizruk-backup",
    // eslint-disable-next-line no-restricted-syntax -- exportedAt is a UTC ISO timestamp, not a day-boundary; physical export time, not user-facing calendar
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    workouts: parseWorkoutsFromStorage(workoutsRaw),
    customExercises: parseCustomExercisesFromStorage(customRaw),
  };
}

export function applyFizrukBackupPayload(
  data: unknown,
  { replace = false }: { replace?: boolean } = {},
) {
  const payload = assertFizrukBackupShape(data);
  return persistFizrukBackupPayload(payload, replace);
}

function persistFizrukBackupPayload(
  payload: FizrukBackupPayload,
  replace: boolean,
) {
  const w = payload.workouts;
  const c = payload.customExercises;
  if (replace) {
    storage.writeRaw(WORKOUTS_STORAGE_KEY, serializeWorkoutsToStorage(w));
    storage.writeRaw(
      CUSTOM_EXERCISES_KEY,
      serializeCustomExercisesToStorage(c),
    );
    return { workouts: w.length, customExercises: c.length };
  }
  const existingW = parseWorkoutsFromStorage(
    storage.readRaw(WORKOUTS_STORAGE_KEY, null),
  );
  const existingC = parseCustomExercisesFromStorage(
    storage.readRaw(CUSTOM_EXERCISES_KEY, null),
  );
  const mergedW = mergeWorkoutsById(existingW, w);
  const mergedC = mergeCustomById(existingC, c);
  storage.writeRaw(WORKOUTS_STORAGE_KEY, serializeWorkoutsToStorage(mergedW));
  storage.writeRaw(
    CUSTOM_EXERCISES_KEY,
    serializeCustomExercisesToStorage(mergedC),
  );
  return { workouts: mergedW.length, customExercises: mergedC.length };
}

/**
 * Повний знімок localStorage для Progress (заміри, шаблони тощо).
 * Сумісний з попереднім форматом `{ schemaVersion, exportedAt, data }`.
 */
export function buildFizrukFullBackupPayload() {
  const data: Record<string, string | null> = {};
  for (const k of FIZRUK_FULL_BACKUP_KEYS) {
    data[k] = storage.readRaw(k, null);
  }
  return {
    kind: "fizruk-full-backup",
    schemaVersion: 1,
    // eslint-disable-next-line no-restricted-syntax -- exportedAt is a UTC ISO timestamp, not a day-boundary; physical export time, not user-facing calendar
    exportedAt: new Date().toISOString(),
    data,
  };
}

/**
 * Імпорт повного бекапу (той самий формат, що buildFizrukFullBackupPayload, або legacy без `kind`).
 * Original behaviour: accept any object with a `.data` object, silently filter
 * non-string values. `isFizrukFullBackupShape` is exported from
 * `./fizrukBackupShape` for stricter callers that want to require the
 * `kind` discriminator.
 */
export function applyFizrukFullBackupPayload(parsed: unknown) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Невірний формат файлу");
  }
  const d = (parsed as { data?: unknown }).data;
  if (!d || typeof d !== "object" || Array.isArray(d)) {
    throw new Error("Невірний формат файлу");
  }
  const dataObj = d as Record<string, unknown>;
  for (const k of FIZRUK_FULL_BACKUP_KEYS) {
    const v = dataObj[k];
    if (typeof v === "string") storage.writeRaw(k, v);
  }
}

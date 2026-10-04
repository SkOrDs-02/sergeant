/**
 * Бекап Фізрука + web-обгортка над localStorage.
 *
 * AI-DANGER: повний бекап ходить у SQLITE, не в localStorage. До
 * 2026-09-22 обидві функції повного бекапу працювали з шістьма
 * `fizruk_*` LS-ключами: експорт їх читав, імпорт у них писав. Від
 * Stage 8 у ті ключі не пише НІХТО (`grep writeRaw` по модулю давав
 * самі ці дві функції), а всі хуки — `useWorkouts`, `useMeasurements`,
 * `useWorkoutTemplates`, `useMonthlyPlan`, `useDailyLog`,
 * `useExerciseCatalog` — читають теплий кеш
 * `getCachedFizrukSqliteState()`. Одноразовий дренаж
 * `importFizrukResidualFromLs` видалено 2026-08 (див. шапку
 * `sqliteReadBoot.ts`), тож місток зник: експорт віддавав порожньо, а
 * імпорт клав дані в глухий кут. Той самий дефект і те саме лікування,
 * що у Фініка (`modules/finyk/lib/finykBackup.ts`).
 *
 * Малий бекап (`buildFizrukBackupPayload` / `applyFizrukBackupPayload`,
 * `kind: "fizruk-backup"`) досі ходить у LS і продакшн-викликів у вебі
 * не має — його чіпає лише власний сьют.
 *
 * Усі pure-шматки (ключі, schema-версії, parse/serialize/merge, payload
 * shape guards) живуть у пакеті `@sergeant/fizruk-domain` або в
 * `fizrukBackupShape.ts`.
 */

import type { DualWriteOutcome } from "@sergeant/dualwrite-core";
import {
  addMissingBy,
  BACKUP_RESTORE_NOT_READY_MESSAGE,
  type BackupRestoreMode,
} from "@shared/lib/backup/restoreMode";
import {
  CUSTOM_ACTIVITIES_KEY,
  CUSTOM_EXERCISES_KEY,
  MEASUREMENTS_STORAGE_KEY,
  MONTHLY_PLAN_STORAGE_KEY,
  TEMPLATES_STORAGE_KEY,
  WORKOUTS_STORAGE_KEY,
  mergeCustomById,
  mergeWorkoutsById,
  parseCustomExercisesFromStorage,
  parseWorkoutsFromStorage,
  serializeCustomExercisesToStorage,
  serializeWorkoutsToStorage,
  type FizrukData,
  type Workout,
} from "@sergeant/fizruk-domain";

import { fizrukStorage } from "./fizrukStorageInstance";
import {
  assertFizrukBackupShape,
  type FizrukBackupPayload,
} from "./fizrukBackupShape";
import { getCachedFizrukSqliteState } from "./sqliteReader";
import type { MeasurementEntry } from "../hooks/useMeasurements";
import { dualWriteFizrukState } from "./sqliteWriter/index";
import type { FizrukDualWriteState } from "./sqliteWriter/diff/index";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractCustomActivitySnapshots,
  extractCustomExerciseSnapshots,
  extractDailyLogSnapshots,
  extractInjurySnapshots,
  extractMeasurementSnapshots,
  extractMonthlyPlanSnapshot,
  extractWorkoutSnapshots,
  extractWorkoutTemplateSnapshots,
  peekFizrukDualWriteState,
  type FizrukDailyLogEntryLike,
  type FizrukInjuryLike,
  type FizrukWorkoutTemplateLike,
} from "./fizrukDualWriteState";

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
 * Ключі зрізів у `data` повного бекапу.
 *
 * Це ІМЕНА ПОЛІВ у файлі, а не адреси сховища: рядки лишились тими
 * самими, що колись були LS-ключами, тільки щоб файли, експортовані до
 * переїзду на SQLite, читались тим самим кодом. `FIZRUK_FULL_BACKUP_KEYS`
 * для цього не годиться — там немає ані щоденника, ані травм, ані своїх
 * занять (вони народились одразу в SQLite), зате є
 * `fizruk_selected_template_id_v1`, якого у вебі не читає й не пише
 * НІХТО. Набір живе тут, бо доменна константа далі обслуговує
 * `FIZRUK_RESET_KEYS` і мобільний застосунок.
 */
const FIZRUK_BACKUP_SLICES = {
  workouts: WORKOUTS_STORAGE_KEY,
  customExercises: CUSTOM_EXERCISES_KEY,
  customActivities: CUSTOM_ACTIVITIES_KEY,
  measurements: MEASUREMENTS_STORAGE_KEY,
  dailyLog: "fizruk_daily_log_v1",
  workoutTemplates: TEMPLATES_STORAGE_KEY,
  injuries: "fizruk_injuries_v1",
  monthlyPlan: MONTHLY_PLAN_STORAGE_KEY,
} as const;

/**
 * Повний знімок даних Фізрука для Progress / бекапу Hub.
 *
 * Формат файлу не змінювався: `{ kind, schemaVersion, exportedAt, data }`,
 * де `data` — мапа «ім'я зрізу → серіалізований JSON-рядок». Змінилось
 * ДЖЕРЕЛО: теплий кеш SQLite замість `fizruk_*` ключів localStorage, у
 * які від Stage 8 не пише ніхто (розбір — у шапці файлу).
 */
export function buildFizrukFullBackupPayload() {
  const cache = getCachedFizrukSqliteState();
  const data: Record<string, string | null> = {
    [FIZRUK_BACKUP_SLICES.workouts]: serializeWorkoutsToStorage(cache.workouts),
    [FIZRUK_BACKUP_SLICES.customExercises]: serializeCustomExercisesToStorage(
      cache.customExercises,
    ),
    [FIZRUK_BACKUP_SLICES.customActivities]: JSON.stringify(
      cache.customActivities,
    ),
    [FIZRUK_BACKUP_SLICES.measurements]: JSON.stringify(cache.measurements),
    [FIZRUK_BACKUP_SLICES.dailyLog]: JSON.stringify(cache.dailyLog),
    [FIZRUK_BACKUP_SLICES.workoutTemplates]: JSON.stringify(
      cache.workoutTemplates,
    ),
    [FIZRUK_BACKUP_SLICES.injuries]: JSON.stringify(cache.injuries),
    [FIZRUK_BACKUP_SLICES.monthlyPlan]: cache.monthlyPlan
      ? JSON.stringify(cache.monthlyPlan)
      : null,
  };
  return {
    kind: "fizruk-full-backup",
    schemaVersion: 1,
    // eslint-disable-next-line no-restricted-syntax -- exportedAt is a UTC ISO timestamp, not a day-boundary; physical export time, not user-facing calendar
    exportedAt: new Date().toISOString(),
    data,
  };
}

/**
 * Імпорт повного бекапу в SQLite — туди, звідки читають усі хуки Фізрука.
 *
 * Два режими (аудит 2026-10-01, data-06), див. `BackupRestoreMode`:
 *
 *  - `merge`: лише додати відсутнє. Рядок із тим самим id лишається таким,
 *    яким був, рядки, яких файл не несе, не чіпаються: жодного `delete` у
 *    diff, а отже жодного tombstone на сервері.
 *  - `replace`: diff іде проти ПОТОЧНОГО теплого кеша, і рядки, яких у файлі
 *    немає, гасяться. Це видалення їде на сервер і на всі пристрої акаунта,
 *    тому режим лише явний (діалог у `HubBackupPanel`).
 *
 * Зріз, якого файл не везе (ключа немає, значення `null` або не рядок),
 * лишається як був в обох режимах — та сама поведінка, що й у старого
 * LS-шляху, який такі значення просто пропускав.
 *
 * Кеш мусить бути теплим: з холодного diff не бачить рядків акаунта, тож
 * «заміна» мовчки стала б злиттям, а `merge` перезаписав би існуючі рядки.
 * Панель не пускає в імпорт, доки кеш не прогрітий; тут це страховка.
 *
 * Чекати обов'язково: `HubBackupPanel` одразу після імпорту робить
 * `window.location.reload()`, а він убив би fire-and-forget запис. Запис
 * журнальований (`dualWriteFizrukState`), результат — `DualWriteOutcome`:
 * `skipped` НЕ успіх, `applyHubBackupPayload` на ньому кидає.
 * Приймає і файли, експортовані до переїзду на SQLite — там ті самі
 * ключі з тими самими серіалізованими рядками.
 */
export async function applyFizrukFullBackupPayload(
  parsed: unknown,
  mode: BackupRestoreMode,
): Promise<DualWriteOutcome> {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Неправильний формат файлу");
  }
  const d = (parsed as { data?: unknown }).data;
  if (!d || typeof d !== "object" || Array.isArray(d)) {
    throw new Error("Неправильний формат файлу");
  }
  const data = d as Record<string, unknown>;
  if (getCachedFizrukSqliteState().refreshedAt === null) {
    throw new Error(BACKUP_RESTORE_NOT_READY_MESSAGE);
  }
  const prev = peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
  const replaced = backupOntoFizrukState(prev, data);
  const next = mode === "replace" ? replaced : mergeFizrukState(prev, replaced);
  return dualWriteFizrukState(prev, next);
}

/**
 * Режим `merge`: поточні рядки + рядки файлу з новим id. `replaced` уже
 * несе `prev` для зрізів, яких файл не везе, тож обʼєднання їх не змінює.
 */
function mergeFizrukState(
  prev: FizrukDualWriteState,
  replaced: FizrukDualWriteState,
): FizrukDualWriteState {
  const byId = (e: { readonly id: string }) => e.id;
  return {
    workouts: addMissingBy(prev.workouts, replaced.workouts, byId),
    customExercises: addMissingBy(
      prev.customExercises,
      replaced.customExercises,
      byId,
    ),
    customActivities: addMissingBy(
      prev.customActivities ?? [],
      replaced.customActivities ?? [],
      byId,
    ),
    measurements: addMissingBy(prev.measurements, replaced.measurements, byId),
    dailyLog: addMissingBy(prev.dailyLog, replaced.dailyLog, byId),
    workoutTemplates: addMissingBy(
      prev.workoutTemplates,
      replaced.workoutTemplates,
      byId,
    ),
    injuries: addMissingBy(prev.injuries, replaced.injuries, byId),
    monthlyPlan: prev.monthlyPlan ?? replaced.monthlyPlan,
  };
}

/** Рядок зрізу, або `undefined` коли файл його не везе. */
function sliceRaw(
  data: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = data[key];
  return typeof v === "string" ? v : undefined;
}

function parseJsonArray(raw: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function backupOntoFizrukState(
  prev: FizrukDualWriteState,
  data: Record<string, unknown>,
): FizrukDualWriteState {
  const workouts = sliceRaw(data, FIZRUK_BACKUP_SLICES.workouts);
  const customExercises = sliceRaw(data, FIZRUK_BACKUP_SLICES.customExercises);
  const customActivities = sliceRaw(
    data,
    FIZRUK_BACKUP_SLICES.customActivities,
  );
  const measurements = sliceRaw(data, FIZRUK_BACKUP_SLICES.measurements);
  const dailyLog = sliceRaw(data, FIZRUK_BACKUP_SLICES.dailyLog);
  const workoutTemplates = sliceRaw(
    data,
    FIZRUK_BACKUP_SLICES.workoutTemplates,
  );
  const injuries = sliceRaw(data, FIZRUK_BACKUP_SLICES.injuries);
  const monthlyPlan = sliceRaw(data, FIZRUK_BACKUP_SLICES.monthlyPlan);

  return {
    workouts:
      workouts === undefined
        ? prev.workouts
        : extractWorkoutSnapshots(
            parseWorkoutsFromStorage(workouts) as Workout[],
          ),
    customExercises:
      customExercises === undefined
        ? prev.customExercises
        : extractCustomExerciseSnapshots(
            parseCustomExercisesFromStorage(
              customExercises,
            ) as FizrukData.RawExerciseDef[],
          ),
    customActivities:
      customActivities === undefined
        ? (prev.customActivities ?? [])
        : extractCustomActivitySnapshots(
            parseJsonArray(customActivities) as FizrukData.ActivityDef[],
          ),
    measurements:
      measurements === undefined
        ? prev.measurements
        : extractMeasurementSnapshots(
            parseJsonArray(measurements) as MeasurementEntry[],
          ),
    dailyLog:
      dailyLog === undefined
        ? prev.dailyLog
        : extractDailyLogSnapshots(
            parseJsonArray(dailyLog) as FizrukDailyLogEntryLike[],
          ),
    workoutTemplates:
      workoutTemplates === undefined
        ? prev.workoutTemplates
        : extractWorkoutTemplateSnapshots(
            parseJsonArray(workoutTemplates) as FizrukWorkoutTemplateLike[],
          ),
    injuries:
      injuries === undefined
        ? prev.injuries
        : extractInjurySnapshots(
            parseJsonArray(injuries) as FizrukInjuryLike[],
          ),
    monthlyPlan:
      monthlyPlan === undefined
        ? prev.monthlyPlan
        : extractMonthlyPlanSnapshot(parseJsonObject(monthlyPlan)),
  };
}

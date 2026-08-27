/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * Заливання демо-payload Фізрука з localStorage у SQLite.
 *
 * AI-CONTEXT: демо-сід (`core/onboarding/seedDemoData/seedFizruk.ts`)
 * пише сирим `writeJSON` у `fizruk_workouts_v1` / `fizruk_measurements_v1`,
 * бо він виконується в `main.tsx` ДО React-дерева і одразу робить
 * `location.replace` — жодного хука, а отже й жодного `triggerFizrukDualWrite`,
 * там ще не існує. Доки модуль читав LS, цього вистачало.
 *
 * Далі сталося таке. Модулі перевели на читання ЛИШЕ з SQLite, а місток
 * LS→SQLite (`importFizrukResidualFromLs`) прибрали 2026-08 як
 * «одноразовий pre-beta drain, тестерів із legacy-даними не лишилось».
 * На той місток спирався не лише legacy — на нього спирався ДЕМО-режим,
 * і саме про це прямим текстом каже докблок `DEMO_LOCAL_USER_ID` у
 * `core/onboarding/onboardingGate.ts`. З його зникненням демо почало
 * показувати порожні модулі, поки картки хабу малювали засіяну
 * статистику: «Фізрук: 2 трен.» у хабі проти «Перше тренування —
 * попереду» в модулі (аудит L-8, 2026-08-07).
 *
 * Чому не «повернути residual import»: той імпортер (понад 500 рядків)
 * розбирав історичні LS-формати різних поколінь, і його прибрали
 * свідомо. Тут потрібне вужче: формат демо-payload ми контролюємо
 * повністю, тож достатньо зібрати з нього звичайний dual-write стан і
 * пропустити через ТОЙ САМИЙ diff+apply, яким ходять живі правки
 * користувача. Нового шляху запису не зʼявляється — отже й нового місця,
 * де дані можуть розійтися з рештою модуля.
 *
 * AI-DANGER: виклик обовʼязково гейтиться демо-режимом. Без гейта це
 * воскресило б legacy-LS у справжніх акаунтів — рівно те, що прибрали
 * навмисно, і що затерло б їхні SQLite-дані старим знімком.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { logger } from "@shared/lib";
import { safeReadLS } from "@shared/lib/storage/storage";

import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractMeasurementSnapshots,
  extractWorkoutSnapshots,
  extractWorkoutTemplateSnapshots,
} from "./fizrukDualWriteState.js";
import { applyFizrukDualWriteOps } from "./sqliteWriter/adapter.js";
import {
  diffFizrukDualWriteOps,
  type FizrukDualWriteState,
} from "./sqliteWriter/diff/index.js";

/** Ключі, у які пише `seedFizruk()`. Свідомо продубльовані літералами. */
const DEMO_WORKOUTS_KEY = "fizruk_workouts_v1";
const DEMO_MEASUREMENTS_KEY = "fizruk_measurements_v1"; // gitleaks:allow
const DEMO_TEMPLATES_KEY = "fizruk_workout_templates_v1";

interface DemoWorkoutsBlob {
  workouts?: readonly unknown[];
}

/**
 * Зібрати dual-write стан із демо-payload у localStorage.
 *
 * @returns `null`, якщо в LS нема нічого придатного — тоді імпорт
 *   не має чого робити й не має що логувати.
 */
export function readFizrukDemoStateFromLs(): FizrukDualWriteState | null {
  const blob = safeReadLS<DemoWorkoutsBlob>(DEMO_WORKOUTS_KEY, null);
  const measurements = safeReadLS<readonly unknown[]>(
    DEMO_MEASUREMENTS_KEY,
    null,
  );

  const templates = safeReadLS<readonly unknown[]>(DEMO_TEMPLATES_KEY, null);

  const workoutsRaw = Array.isArray(blob?.workouts) ? blob.workouts : [];
  const measurementsRaw = Array.isArray(measurements) ? measurements : [];
  const templatesRaw = Array.isArray(templates) ? templates : [];
  if (
    workoutsRaw.length === 0 &&
    measurementsRaw.length === 0 &&
    templatesRaw.length === 0
  ) {
    return null;
  }

  return {
    ...EMPTY_FIZRUK_DUAL_WRITE_STATE,
    workouts: extractWorkoutSnapshots(workoutsRaw),
    measurements: extractMeasurementSnapshots(measurementsRaw),
    workoutTemplates: extractWorkoutTemplateSnapshots(templatesRaw),
  };
}

export interface ImportFizrukDemoSeedInput {
  readonly client: SqliteMigrationClient;
  readonly userId: string;
  readonly nowIso: string;
}

/**
 * Залити демо-payload у SQLite. Ідемпотентно: diff віддає upsert-и за
 * `id`, тож повторний бут переписує ті самі рядки тими самими
 * значеннями. Це узгоджено з тим, що демо й так відновлює канонічний
 * приклад на кожен cold start (`reseedDemoData`).
 *
 * Ніколи не кидає — демо не має права завалити бут модуля.
 *
 * @returns Скільки операцій застосовано (0, якщо не було чого лити).
 */
export async function importFizrukDemoSeed(
  input: ImportFizrukDemoSeedInput,
): Promise<number> {
  try {
    const next = readFizrukDemoStateFromLs();
    if (!next) return 0;

    const ops = diffFizrukDualWriteOps(EMPTY_FIZRUK_DUAL_WRITE_STATE, next);
    if (ops.length === 0) return 0;

    // Свідомо повертаємо `result.applied`, а НЕ `ops.length`: адаптер
    // ловить помилку кожної операції окремо й не кидає назовні, тож
    // `ops.length` рапортував би «залито», навіть коли sqlite мовчки
    // відкинув усе до одної. Дзвінок сюди має знати правду — інакше
    // порожнє демо виглядало б у логах як успішний імпорт.
    const result = await applyFizrukDualWriteOps(input.client, ops, {
      userId: input.userId,
      clientTs: input.nowIso,
    });
    if (result.errored > 0) {
      logger.warn("[fizruk.demoSeed] частина демо-даних не долетіла", {
        applied: result.applied,
        errored: result.errored,
      });
    }
    return result.applied;
  } catch (err) {
    logger.warn("[fizruk.demoSeed] не вдалось залити демо-дані в SQLite", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

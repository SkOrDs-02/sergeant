/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * Заливання демо-payload Рутини з localStorage у SQLite.
 *
 * AI-CONTEXT: демо-сід (`core/onboarding/seedDemoData/seedRoutine.ts`)
 * пише сирим `writeJSON` у ЄДИНИЙ ключ `hub_routine_v1` — цілісний
 * `RoutineState`-подібний обʼєкт (`{schemaVersion, prefs, tags,
 * categories, habits[], completions, pushupsByDate, habitOrder,
 * completionNotes}`). Це виконується в `main.tsx` ДО React-дерева і
 * одразу робить `location.replace` — жодного хука, отже й жодного
 * dual-write, там ще не існує. Доки модуль читав LS, цього вистачало.
 *
 * Далі сталося таке. Модуль перевели на читання ЛИШЕ з SQLite
 * (`routineStorage.ts` → `loadRoutineState()` бере
 * `getCachedSqliteRoutineState()` + `getCachedSqliteCompletions()`,
 * жодного `safeReadLS`), а місток LS→SQLite
 * (`importRoutineResidualFromLs`) прибрали 2026-08 як «одноразовий
 * pre-beta drain, тестерів із legacy-даними не лишилось». На той місток
 * спирався не лише legacy — на нього спирався ДЕМО-режим, і саме про це
 * прямим текстом каже докблок `DEMO_LOCAL_USER_ID` у
 * `core/onboarding/onboardingGate.ts`. З його зникненням демо почало
 * показувати порожній модуль, поки картки хабу малювали засіяну
 * `routine_quick_stats` (аудит L-8, 2026-08-07).
 *
 * Чому не «повернути residual import»: той імпортер розбирав історичні
 * LS-формати різних поколінь, і його прибрали свідомо. Тут потрібне
 * вужче: формат демо-payload ми контролюємо повністю, і на відміну від
 * Фізрука Рутина вже має готовий парсер сирого blob-у —
 * `normalizeRoutineState()` (`@sergeant/routine-domain`) — тож
 * достатньо прогнати `defaultRoutineState() → normalizeRoutineState(ls)`
 * через ТОЙ САМИЙ diff+apply, яким ходять живі правки користувача
 * (`diffRoutineDualWriteOps` + `applyRoutineDualWriteOps`). Нового
 * шляху запису не зʼявляється — отже й нового місця, де дані можуть
 * розійтися з рештою модуля. `extract*Snapshots`-шар Фізрука тут не
 * потрібен: `normalizeRoutineState` сам вміє повний `RoutineState`.
 *
 * Пастка: сід пише `schemaVersion: 1`, а поточний
 * `ROUTINE_SCHEMA_VERSION` — 4. `normalizeRoutineState` робить
 * `{...base, ...p}`, тож 1 протече в normalized-стан — для diff-у це
 * байдуже (diff дивиться на поля, не на версію), тож свідомо не лікуємо.
 *
 * AI-DANGER: виклик обовʼязково гейтиться демо-режимом. Без гейта це
 * воскресило б legacy-LS у справжніх акаунтів — рівно те, що прибрали
 * навмисно, і що затерло б їхні SQLite-дані старим знімком.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import {
  defaultRoutineState,
  normalizeRoutineState,
  ROUTINE_STORAGE_KEY,
  type RoutineState,
} from "@sergeant/routine-domain";
import { logger } from "@shared/lib";
import { safeReadLS } from "@shared/lib/storage/storage";

import { applyRoutineDualWriteOps } from "./sqliteWriter/adapter.js";
import { diffRoutineDualWriteOps } from "./sqliteWriter/diff.js";

/**
 * Зібрати демо-стан із `hub_routine_v1` у localStorage.
 *
 * @returns `null`, коли в LS немає нічого придатного (нема ключа, або
 *   `habits` порожній — тоді лити нема чого й нема що логувати).
 */
export function readRoutineDemoStateFromLs(): RoutineState | null {
  const raw = safeReadLS<unknown>(ROUTINE_STORAGE_KEY, null);
  if (!raw) return null;

  const normalized = normalizeRoutineState(raw);
  if (normalized.habits.length === 0) return null;

  return normalized;
}

export interface ImportRoutineDemoSeedInput {
  readonly client: SqliteMigrationClient;
  readonly userId: string;
  readonly nowIso: string;
}

/**
 * Залити демо-payload у SQLite. Ідемпотентно: diff проти
 * `defaultRoutineState()` віддає ті самі upsert-и за `id` на кожному
 * бут-циклі, тож повторний виклик переписує ті самі рядки тими самими
 * значеннями. Це узгоджено з тим, що демо й так відновлює канонічний
 * приклад на кожен cold start (`reseedDemoData`).
 *
 * Ніколи не кидає — демо не має права завалити бут модуля.
 *
 * @returns Скільки операцій застосовано (0, якщо не було чого лити).
 */
export async function importRoutineDemoSeed(
  input: ImportRoutineDemoSeedInput,
): Promise<number> {
  try {
    const next = readRoutineDemoStateFromLs();
    if (!next) return 0;

    const ops = diffRoutineDualWriteOps(defaultRoutineState(), next);
    if (ops.length === 0) return 0;

    // Свідомо повертаємо `result.applied`, а НЕ `ops.length`: адаптер
    // ловить помилку кожної операції окремо й не кидає назовні, тож
    // `ops.length` рапортував би «залито», навіть коли sqlite мовчки
    // відкинув усе до одної. Дзвінок сюди має знати правду — інакше
    // порожнє демо виглядало б у логах як успішний імпорт.
    const result = await applyRoutineDualWriteOps(input.client, ops, {
      userId: input.userId,
      clientTs: input.nowIso,
    });
    if (result.errored > 0) {
      logger.warn("[routine.demoSeed] частина демо-даних не долетіла", {
        applied: result.applied,
        errored: result.errored,
      });
    }
    return result.applied;
  } catch (err) {
    logger.warn("[routine.demoSeed] не вдалось залити демо-дані в SQLite", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

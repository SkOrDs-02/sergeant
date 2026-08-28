/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * Заливання демо-payload Харчування з localStorage у SQLite.
 *
 * AI-CONTEXT: демо-сід (`core/onboarding/seedDemoData/seedNutrition.ts`)
 * пише сирим `writeJSON` у `nutrition_log_v1` / `nutrition_prefs_v1` /
 * `nutrition_water_v1`, бо він виконується в `main.tsx` ДО React-дерева і
 * одразу робить `location.replace` — жодного хука, а отже й жодного
 * `triggerNutritionDualWrite`, там ще не існує. Доки модуль читав LS,
 * цього вистачало.
 *
 * Далі сталося таке. Модулі перевели на читання ЛИШЕ з SQLite
 * (`nutritionStorage.ts` → `getCachedNutritionSqliteState()`,
 * `waterStorage.ts` — «SQLite-only, no LS fallback»), а місток LS→SQLite
 * (`importNutritionResidualFromLs`) прибрали 2026-08 як «одноразовий
 * pre-beta drain, тестерів із legacy-даними не лишилось». На той місток
 * спирався не лише legacy — на нього спирався ДЕМО-режим, і саме про це
 * прямим текстом каже докблок `DEMO_LOCAL_USER_ID` у
 * `core/onboarding/onboardingGate.ts`. З його зникненням демо почало
 * показувати порожній модуль Харчування (аудит L-8, 2026-08-07) —
 * рівно та сама історія, що й у Фізрука
 * (`fizruk/lib/demoSeedImport.ts`), звідки скопійовано форму цього файлу.
 *
 * Чому не «повернути residual import»: той шлях розбирав історичні
 * LS-формати різних поколінь і його прибрали свідомо. Тут потрібне
 * вужче: формат демо-payload ми контролюємо повністю, тож достатньо
 * зібрати з нього звичайний dual-write стан і пропустити через ТОЙ САМИЙ
 * diff+apply, яким ходять живі правки користувача. Нового шляху запису
 * не зʼявляється — отже й нового місця, де дані можуть розійтися з
 * рештою модуля.
 *
 * AI-DANGER: виклик обовʼязково гейтиться демо-режимом (див.
 * `sqliteReadBoot.ts`). Без гейта це воскресило б legacy-LS у СПРАВЖНІХ
 * акаунтів — рівно те, що прибрали навмисно, і що затерло б їхні
 * SQLite-дані старим знімком.
 *
 * Скоуп навмисно вужчий за повний dual-write стан:
 *
 *   - **pantries / activePantryId / shoppingList** — сід їх не пише,
 *     тож комора в демо лишиться порожньою. Свідоме обмеження, не
 *     розширюємо тут.
 *   - **recipes** — рецепти живуть в IndexedDB, не в LS
 *     (`nutritionStorage.ts`), сід їх і не пише — завжди `[]`.
 *   - **pantryEvents** — ОБОВʼЯЗКОВО `[]`. Це append-only журнал
 *     (`diff.ts` `pantryEvents`); ненульове значення тут згенерувало б
 *     фейкові ledger-події, яких насправді не було.
 *
 * Prefs у dual-write мають форму `{ prefsJson, activePantryId }`, а не
 * сирий обʼєкт — `prefsJson` збирається через `normalizeNutritionPrefs`,
 * інакше в `prefs_json` поїде сирий сід із чужими/невалідованими полями.
 *
 * `diffNutritionDualWriteOps` автоматично емітить `goal-period-insert`
 * при кожному `prefs-upsert` зі непорожньою ціллю (`diff.ts` →
 * `diffGoalPeriodOps`) — це ДОДАТКОВИЙ append-only журнал, не LWW-upsert.
 * Оскільки `reseedDemoData()` виконується на кожен cold start, це могло
 * б означати ріст `nutrition_goal_periods` на кожне перезавантаження
 * демо. Насправді ні: `insertGoalPeriod` (`adapter.goalPeriods.ts`)
 * рахує `id` детерміновано з `effective_from` (київський день) + самих
 * значень цілі + `deviceId`, і пише через `INSERT OR IGNORE`. Доки цілі
 * демо-сіда не змінюються і перезавантаження лишається в межах того
 * самого київського дня, повторний `goal-period-insert` бʼється в той
 * самий `id` і мовчки ігнорується — рядок не дублюється. Перевірено
 * тестом на детермінований `id` при двох послідовних прогонах
 * (`demoSeedImport.test.ts`).
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import {
  normalizeNutritionLog,
  normalizeNutritionPrefs,
  normalizeWaterLog,
} from "@sergeant/nutrition-domain";
import { logger } from "@shared/lib";
import { safeReadLS } from "@shared/lib/storage/storage";

import { extractMealSnapshots } from "./nutritionStorage.js";
import { applyNutritionDualWriteOps } from "./sqliteWriter/adapter.js";
import {
  diffNutritionDualWriteOps,
  EMPTY_NUTRITION_DUAL_WRITE_STATE,
  type NutritionDualWriteState,
} from "./sqliteWriter/diff.js";

/** Ключі, у які пише `seedNutrition()`. Свідомо продубльовані літералами. */
const DEMO_LOG_KEY = "nutrition_log_v1";
const DEMO_PREFS_KEY = "nutrition_prefs_v1"; // gitleaks:allow
const DEMO_WATER_KEY = "nutrition_water_v1";

/**
 * Зібрати dual-write стан із демо-payload у localStorage.
 *
 * @returns `null`, якщо в LS нема нічого придатного — тоді імпорт
 *   не має чого робити й не має що логувати.
 */
export function readNutritionDemoStateFromLs(): NutritionDualWriteState | null {
  const logRaw = safeReadLS<unknown>(DEMO_LOG_KEY, null);
  const prefsRaw = safeReadLS<unknown>(DEMO_PREFS_KEY, null);
  const waterRaw = safeReadLS<unknown>(DEMO_WATER_KEY, null);

  const meals = extractMealSnapshots(normalizeNutritionLog(logRaw ?? {}));
  const waterLog = normalizeWaterLog(waterRaw ?? {});
  const hasPrefs = !!prefsRaw && typeof prefsRaw === "object";

  if (meals.length === 0 && Object.keys(waterLog).length === 0 && !hasPrefs) {
    return null;
  }

  return {
    ...EMPTY_NUTRITION_DUAL_WRITE_STATE,
    meals,
    waterLog,
    prefs: hasPrefs
      ? {
          prefsJson: JSON.stringify(normalizeNutritionPrefs(prefsRaw)),
          activePantryId: null,
        }
      : null,
  };
}

export interface ImportNutritionDemoSeedInput {
  readonly client: SqliteMigrationClient;
  readonly userId: string;
  readonly nowIso: string;
}

/**
 * Залити демо-payload у SQLite. Ідемпотентно: meal-upsert / water-log-set /
 * prefs-upsert усі йдуть за `id`/`ключем-дня`, тож повторний бут переписує
 * ті самі рядки тими самими значеннями — узгоджено з тим, що демо й так
 * відновлює канонічний приклад на кожен cold start (`reseedDemoData`).
 * `goal-period-insert` — append-only, але дедуплюється на рівні SQL
 * (`INSERT OR IGNORE` з детермінованим `id`, див. докблок вище).
 *
 * Ніколи не кидає — демо не має права завалити бут модуля.
 *
 * @returns Скільки операцій застосовано (0, якщо не було чого лити).
 */
export async function importNutritionDemoSeed(
  input: ImportNutritionDemoSeedInput,
): Promise<number> {
  try {
    const next = readNutritionDemoStateFromLs();
    if (!next) return 0;

    const ops = diffNutritionDualWriteOps(
      EMPTY_NUTRITION_DUAL_WRITE_STATE,
      next,
    );
    if (ops.length === 0) return 0;

    // Свідомо повертаємо `result.applied`, а НЕ `ops.length`: адаптер
    // ловить помилку кожної операції окремо й не кидає назовні, тож
    // `ops.length` рапортував би «залито», навіть коли sqlite мовчки
    // відкинув усе до одної. Дзвінок сюди має знати правду — інакше
    // порожнє демо виглядало б у логах як успішний імпорт.
    const result = await applyNutritionDualWriteOps(input.client, ops, {
      userId: input.userId,
      clientTs: input.nowIso,
    });
    if (result.errored > 0) {
      logger.warn("[nutrition.demoSeed] частина демо-даних не долетіла", {
        applied: result.applied,
        errored: result.errored,
      });
    }
    return result.applied;
  } catch (err) {
    logger.warn("[nutrition.demoSeed] не вдалось залити демо-дані в SQLite", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

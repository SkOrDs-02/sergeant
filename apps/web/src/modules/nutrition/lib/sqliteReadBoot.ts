/**
 * Last validated: 2026-08-08
 * Status: Active
 * Boot wiring for the Nutrition SQLite read path (PR #033).
 *
 * Mirrors `apps/web/src/modules/fizruk/lib/sqliteReadBoot.ts`. Called
 * once from the Nutrition app shell (via `useNutritionSqliteReadBoot`)
 * after the React-Query `me` cache and the sqlite-wasm singleton are
 * available:
 *
 *  1. Runs the nutrition SQLite migrations so the tables exist.
 *  1.5. Under the demo flag, fills the SQLite tables from the demo
 *       seed's LS payload — see `importNutritionDemoSeed()` below.
 *  2. Performs the initial `refreshNutritionSqliteState()` so the cache
 *     is warm before the first overlay read.
 *
 * Stage 8 PR #057n dropped `feature.nutrition.sqlite_v2.read_sqlite` —
 * the boot is unconditional once a `userId` is available. The function
 * latches via the module-level `booted` flag so the second call is a
 * no-op.
 *
 * Stage 8 PR #057n-tombstone originally also drained any residual LS
 * values (`nutrition_log_v1`, `nutrition_pantries_v1`,
 * `nutrition_active_pantry_v1`, `nutrition_prefs_v1`) into SQLite here
 * via `importNutritionResidualFromLs` (`./residualImport.ts`). That
 * one-time pre-beta drain was removed 2026-08 once no testers were left
 * with pre-SQLite LS data to migrate — see git history for the prior
 * implementation.
 *
 * ⚠️ Те видалення забрало з собою й ДЕМО-режим: демо-сід пише payload у
 * ті самі LS-ключі, і саме residual-дренаж доносив його до SQLite (це
 * прямим текстом стоїть у докблоці `DEMO_LOCAL_USER_ID`). Без нього
 * демо малювало порожній модуль Харчування (аудит L-8, 2026-08-07).
 * Крок 1.5 нижче — `importNutritionDemoSeed()` — закриває саме цей
 * розрив і працює ЛИШЕ під демо-прапорцем; це не повернення legacy-
 * міграції.
 */

import { logger } from "@shared/lib";
import { recordReadFallback } from "../../../core/observability/dualWriteTelemetry.js";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import { isDemoActive } from "../../../core/onboarding/onboardingGate.js";
import { migrateNutrition } from "./clientMigrate.js";
import { importNutritionDemoSeed } from "./demoSeedImport.js";
import { registerRealEntryCounter } from "../../../core/onboarding/realEntryProbe.js";
import {
  getCachedNutritionSqliteState,
  refreshNutritionSqliteState,
} from "./sqliteReader.js";

// AI-CONTEXT: FTUX-детекція «чи є справжні записи» читає канонічний
// warm-cache через реєстр (`core/onboarding/realEntryProbe`), а не
// tombstone-нутий LS-ключ `nutrition_log_v1`. Реєструємось на module-scope:
// цей файл вантажиться лише у складі лінивого boot-кластера модуля,
// тож хабовий eager-чанк нових ребер не отримує.
registerRealEntryCounter("nutrition", () => {
  let meals = 0;
  for (const day of Object.values(getCachedNutritionSqliteState().log)) {
    meals += day.meals.length;
  }
  return meals;
});

let booted = false;

/**
 * Initialise the SQLite read path.
 *
 * @param userId - The authenticated user's id (from the `me` query).
 *   When `null` the boot is skipped (pre-auth window).
 * @returns `true` if the SQLite read path was activated.
 */
export async function bootNutritionSqliteReadPath(
  userId: string | null,
): Promise<boolean> {
  if (booted) return false;
  if (!userId) return false;

  try {
    const handle = await getSqliteDb();
    const client = handle.migrationClient();
    await migrateNutrition(client);

    // Демо: залити засіяний payload із LS у SQLite ДО першого читання,
    // інакше модуль намалює порожньо (аудит L-8). Гейт на демо
    // обовʼязковий — див. AI-DANGER у `demoSeedImport.ts`. Порядок теж
    // важливий: нижче йде `refreshNutritionSqliteState`, який гріє кеш, з
    // якого рендериться модуль.
    if (isDemoActive()) {
      // `new Date()` тут — wall-clock `clientTs` для LWW-гварда, не
      // день-ключ; nutrition не входить у files-скоуп
      // `no-restricted-syntax` new-Date()-guard-а в eslint.cross-surface.js
      // (Theme 1 покриває лише finyk/fizruk/routine), тож disable-коментар
      // не потрібен — той самий випадок, що й `adapter.goalPeriods.ts`.
      const applied = await importNutritionDemoSeed({
        client,
        userId,
        nowIso: new Date().toISOString(),
      });
      if (applied > 0) {
        logger.debug("[nutrition.demoSeed] демо-дані залито в SQLite", {
          applied,
        });
      }
    }

    await refreshNutritionSqliteState(client, userId);

    booted = true;
    return true;
  } catch (err) {
    logger.warn(
      "[nutrition.sqliteRead] boot failed, falling back to LS",
      err instanceof Error ? err.message : err,
    );
    recordReadFallback(
      "nutrition",
      err instanceof Error ? `boot-failed: ${err.message}` : "boot-failed",
    );
    return false;
  }
}

/** Test helper — reset boot state between specs. */
export function __resetNutritionSqliteReadBootForTests(): void {
  booted = false;
}

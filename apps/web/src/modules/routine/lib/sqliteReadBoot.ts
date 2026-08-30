/**
 * Boot wiring for the SQLite read path (PR #025).
 *
 * Called once from `RoutineApp` (or the module bootstrap) after the
 * React-Query `me` cache and the sqlite-wasm singleton are available.
 *
 * Stage 8 PR #057r-flag dropped `feature.routine.sqlite_v2.read_sqlite`
 * — boot is now unconditional once `userId` is known.
 *
 * On success it performs the initial `refreshSqliteRoutineState()` /
 * `refreshSqliteCompletions()` so the cache is warm before the first
 * render; `loadRoutineState()` then overlays the cached values onto
 * `defaultRoutineState()` (no LS read).
 *
 * The function is idempotent — calling it twice is a no-op on the
 * second call.
 *
 * Stage 8 PR #057r-tombstone originally also added a residual-import
 * drain here so any leftover `hub_routine_v1` LS blob was bulk-imported
 * into SQLite (with a stale LWW timestamp) and then deleted before the
 * first cache refresh (`importRoutineResidualFromLs`,
 * `./residualImport.ts`). That one-time pre-beta drain was removed
 * 2026-08 once no testers were left with pre-SQLite LS data to migrate
 * — see git history for the prior implementation.
 *
 * ⚠️ Те видалення забрало з собою й ДЕМО-режим: демо-сід пише payload у
 * той самий LS-ключ (`hub_routine_v1`), і саме residual-дренаж доносив
 * його до SQLite (це прямим текстом стоїть у докблоці
 * `DEMO_LOCAL_USER_ID`). Без нього демо малювало порожній модуль поряд
 * із засіяними картками хабу (аудит L-8, 2026-08-07). Крок нижче —
 * `importRoutineDemoSeed()` — закриває саме цей розрив і працює ЛИШЕ під
 * демо-прапорцем; це не повернення legacy-міграції. Дзеркалить
 * `apps/web/src/modules/fizruk/lib/sqliteReadBoot.ts` (крок 1.5).
 */

import { logger } from "@shared/lib";
import { recordReadFallback } from "../../../core/observability/dualWriteTelemetry.js";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import { isDemoActive } from "../../../core/onboarding/onboardingGate.js";

import { migrateRoutine } from "./clientMigrate.js";
import { importRoutineDemoSeed } from "./demoSeedImport.js";
import { registerRealEntryCounter } from "../../../core/onboarding/realEntryProbe.js";
import {
  getCachedSqliteRoutineState,
  refreshSqliteCompletions,
  refreshSqliteRoutineState,
} from "./sqliteReader.js";

// AI-CONTEXT: FTUX-детекція «чи є справжні записи» читає канонічний
// warm-cache через реєстр (`core/onboarding/realEntryProbe`), а не
// tombstone-нутий LS-ключ `hub_routine_v1`. Реєструємось на module-scope:
// цей файл вантажиться лише у складі лінивого boot-кластера модуля,
// тож хабовий eager-чанк нових ребер не отримує.
registerRealEntryCounter(
  "routine",
  () => getCachedSqliteRoutineState().habits.length,
);

let booted = false;

/**
 * Initialise the SQLite read path.
 *
 * @param userId - The authenticated user's id (from the `me` query).
 *   When `null` the boot is skipped (pre-auth window).
 * @returns `true` if the SQLite read path was activated.
 */
export async function bootSqliteReadPath(
  userId: string | null,
): Promise<boolean> {
  if (booted) return false;
  if (!userId) return false;

  try {
    const handle = await getSqliteDb();
    const client = handle.migrationClient();
    await migrateRoutine(client);

    // Демо: залити засіяний payload із LS у SQLite ДО першого читання,
    // інакше модуль намалює порожньо (аудит L-8). Гейт на демо
    // обовʼязковий — див. AI-DANGER у `demoSeedImport.ts`. Порядок теж
    // важливий: нижче йде `refreshSqliteCompletions` /
    // `refreshSqliteRoutineState`, які гріють кеш, з якого рендериться
    // модуль.
    if (isDemoActive()) {
      const applied = await importRoutineDemoSeed({
        client,
        userId,
        // eslint-disable-next-line no-restricted-syntax -- LWW clientTs wall-clock, не день-ключ
        nowIso: new Date().toISOString(),
      });
      if (applied > 0) {
        logger.debug("[routine.demoSeed] демо-дані залито в SQLite", {
          applied,
        });
      }
    }

    await refreshSqliteCompletions(client, userId);
    // Stage 10: also warm the full-state cache (habits, tags,
    // categories, prefs, pushups, habitOrder, completionNotes).
    await refreshSqliteRoutineState(client, userId);

    booted = true;
    return true;
  } catch (err) {
    logger.warn(
      "[routine.sqliteRead] boot failed, falling back to LS",
      err instanceof Error ? err.message : err,
    );
    recordReadFallback(
      "routine",
      err instanceof Error ? `boot-failed: ${err.message}` : "boot-failed",
    );
    return false;
  }
}

/** Test helper — reset boot state between specs. */
export function __resetSqliteReadBootForTests(): void {
  booted = false;
}

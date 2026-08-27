/**
 * Boot wiring for the Finyk SQLite read path.
 *
 * Mirrors `apps/web/src/modules/fizruk/lib/sqliteReadBoot.ts`.
 * Called once from the Finyk app shell (via `useFinykSqliteReadBoot`)
 * after the React-Query `me` cache and the sqlite-wasm singleton are
 * available. Steps:
 *
 *  1. Runs the finyk SQLite migrations so the tables exist.
 *  2. Performs the initial `refreshFinykSqliteState()` so the cache
 *     is warm before the first overlay read.
 *
 * Stage 8 PR #057k-flag — `feature.finyk.sqlite_v2.read_sqlite` was
 * graduated out of the registry; the boot now fires unconditionally
 * once a `userId` is available. Idempotent — calling it twice is a
 * no-op on the second call.
 *
 * Stage 8 PR #057k-tombstone originally also drained any residual LS
 * values (14 `finyk_*` domain keys + `finyk_show_balance_v1`) into
 * SQLite here via `importFinykResidualFromLs` (`./residualImport.ts`).
 * That one-time pre-beta drain was removed 2026-08 once no testers were
 * left with pre-SQLite LS data to migrate — see git history for the
 * prior implementation.
 *
 * ⚠️ Те видалення забрало з собою й ДЕМО-режим — той самий root cause,
 * що й у Фізруку (аудит L-8, 2026-08-07; докладний AI-CONTEXT — у
 * `./demoSeedImport.ts`). Крок 1.5 нижче — `importFinykDemoSeed()` —
 * закриває розрив для ручних витрат / кастомних категорій / плану;
 * це не повернення legacy-міграції.
 */

import { logger } from "@shared/lib";
import { recordReadFallback } from "../../../core/observability/dualWriteTelemetry.js";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import { isDemoActive } from "../../../core/onboarding/onboardingGate.js";
import { migrateFinyk } from "./clientMigrate.js";
import { importFinykDemoSeed } from "./demoSeedImport.js";
import { registerRealEntryCounter } from "../../../core/onboarding/realEntryProbe.js";
import { getVisibleFinykMonoMirrorState } from "./monoMirrorReader.js";
import {
  getCachedFinykSqliteState,
  refreshFinykSqliteState,
} from "./sqliteReader.js";

// AI-CONTEXT: FTUX-детекція «чи є справжні записи» читає канонічний
// warm-cache через реєстр (`core/onboarding/realEntryProbe`), а не
// tombstone-нуті LS-ключі `finyk_manual_expenses_v1` / `finyk_tx_cache`.
// Реєструємось на module-scope: цей файл вантажиться лише у складі
// лінивого boot-кластера модуля, тож хабовий eager-чанк нових ребер не
// отримує. Рахуємо обидва джерела — ручні витрати і дзеркало Mono:
// підключений банк без жодної ручної витрати — це так само «не новий».
registerRealEntryCounter(
  "finyk",
  () =>
    getCachedFinykSqliteState().manualExpenses.length +
    getVisibleFinykMonoMirrorState().transactions.length,
);

let booted = false;

/**
 * Initialise the SQLite read path.
 *
 * @param userId - The authenticated user's id (from the `me` query).
 *   When `null` the boot is skipped (pre-auth window).
 * @returns `true` if the SQLite read path was activated.
 */
export async function bootFinykSqliteReadPath(
  userId: string | null,
): Promise<boolean> {
  if (booted) return false;
  if (!userId) return false;

  try {
    const handle = await getSqliteDb();
    const client = handle.migrationClient();
    await migrateFinyk(client);

    // Демо: залити засіяний payload із LS у SQLite ДО першого читання,
    // інакше модуль намалює порожньо (аудит L-8). Гейт на демо
    // обовʼязковий — див. AI-DANGER у `demoSeedImport.ts`. Порядок теж
    // важливий: нижче йде `refreshFinykSqliteState`, який гріє кеш, з
    // якого рендериться модуль.
    if (isDemoActive()) {
      const applied = await importFinykDemoSeed({
        client,
        userId,
        // eslint-disable-next-line no-restricted-syntax -- LWW clientTs wall-clock, не день-ключ
        nowIso: new Date().toISOString(),
      });
      if (applied > 0) {
        logger.debug("[finyk.demoSeed] демо-дані залито в SQLite", {
          applied,
        });
      }
    }

    await refreshFinykSqliteState(client, userId);

    booted = true;
    return true;
  } catch (err) {
    logger.warn(
      "[finyk.sqliteRead] boot failed, falling back to LS",
      err instanceof Error ? err.message : err,
    );
    recordReadFallback(
      "finyk",
      err instanceof Error ? `boot-failed: ${err.message}` : "boot-failed",
    );
    return false;
  }
}

/** Test helper — reset boot state between specs. */
export function __resetFinykSqliteReadBootForTests(): void {
  booted = false;
}

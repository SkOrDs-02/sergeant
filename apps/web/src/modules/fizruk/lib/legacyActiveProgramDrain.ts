/**
 * Last validated: 2026-10-20
 * Status: Active
 *
 * Одноразовий дрен LS-ключа `fizruk_active_program_id_v1` у SQLite
 * `fizruk_programs` (data-39).
 *
 * До цього `useTrainingProgram` тримав вибір програми лише в localStorage:
 * він не їхав на сервер, не переживав вихід з акаунта й різнився між
 * пристроями. Тепер джерело правди - `fizruk_programs` (dual-write + sync),
 * а ключ `@deprecated`. Щоб люди, які вже обрали програму, її не втратили,
 * на бут читання значення переноситься в SQLite і ключ видаляється.
 *
 * Правила:
 *  - рядок `fizruk_programs` уже є (свій запис або pull з іншого пристрою) -
 *    SQLite виграє, LS-значення застаріле: ключ видаляється, нічого не пишемо;
 *  - рядка немає - пишемо op `programs-set` тим самим адаптером, що й хук
 *    (отже, й у sync-outbox), і лише ПІСЛЯ успіху видаляємо ключ;
 *  - збій запису лишає ключ на місці: наступний бут спробує знову.
 *
 * Ніколи не кидає: збій дрену не має валити бут читання.
 */
import {
  ACTIVE_PROGRAM_KEY,
  normalizeActiveProgramState,
} from "@sergeant/fizruk-domain";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { logger } from "@shared/lib";
import { safeReadStringLS, safeRemoveLS } from "@shared/lib/storage/storage";

import {
  getCachedFizrukSqliteState,
  refreshFizrukSqliteState,
} from "./sqliteReader.js";
import { applyFizrukDualWriteOps } from "./sqliteWriter/adapter.js";

/** LWW-час міграції LS-значення: старіший за будь-який реальний вибір. */
const LEGACY_MIGRATION_CLIENT_TS = "1970-01-01T00:00:00.000Z";

/**
 * Має викликатися після `refreshFizrukSqliteState()`: перевірка «рядок уже є»
 * читає свіжий кеш.
 *
 * @returns `true`, коли значення перенесено в SQLite; `false` - нічого не
 *   писали (немає ключа, SQLite уже має рядок, або запис не вдався).
 */
export async function drainLegacyActiveProgram(
  client: SqliteMigrationClient,
  userId: string,
): Promise<boolean> {
  try {
    const raw = safeReadStringLS(ACTIVE_PROGRAM_KEY);
    if (raw === null) return false;
    const { activeProgramId } = normalizeActiveProgramState(raw);

    if (activeProgramId === null || getCachedFizrukSqliteState().programs) {
      safeRemoveLS(ACTIVE_PROGRAM_KEY);
      return false;
    }

    const result = await applyFizrukDualWriteOps(
      client,
      [{ kind: "programs-set", programs: { activeProgramId } }],
      // Значення з LS не має справжнього часу вибору: беремо «епоху», щоб
      // будь-який реальний вибір (локальний чи з іншого пристрою) переміг за LWW.
      { userId, clientTs: LEGACY_MIGRATION_CLIENT_TS },
    );
    if (result.errored > 0 || result.applied === 0) return false;

    safeRemoveLS(ACTIVE_PROGRAM_KEY);
    await refreshFizrukSqliteState(client, userId);
    return true;
  } catch (err) {
    logger.warn(
      "[fizruk.activeProgramDrain] drain failed",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

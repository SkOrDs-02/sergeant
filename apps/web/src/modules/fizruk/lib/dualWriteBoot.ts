/**
 * Boot wiring for the Fizruk dual-write context (PR #028 follow-up).
 *
 * Stage 4 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. PR #028 shipped the
 * Fizruk dual-write orchestrator and trigger but never installed the
 * context from the platform bootstrap — so the dual-write pipeline
 * stayed dormant in production. This module closes that gap. Mirror of
 * `apps/web/src/modules/routine/lib/dualWriteBoot.ts`.
 *
 * Stage 8 PR #056f dropped the `isFlagEnabled` callback — the
 * `feature.fizruk.sqlite_v2.dual_write` flag was removed from the
 * registry once it had been default-on with no toggle path remaining.
 * Registration is now `userId`-gated only.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import {
  registerFizrukDualWriteContext,
  type FizrukDualWriteContext,
} from "./sqliteWriter/index.js";
import { migrateFizruk } from "./clientMigrate.js";

export interface BootFizrukDualWriteInput {
  getUserId(): string | null;
}

/**
 * Засувка «міграції вже прогнано» для шляху ЗАПИСУ.
 *
 * Та сама діра, що була в `routine`, і закрита разом із нею:
 * `getMigrationClient` віддає з'єднання, а не готову схему — таблиці
 * створює асинхронний read-boot. На `kvvfs` прогін устигав раніше за
 * першу дію людини; з базою в OPFS кожен крок їде раунд-тріпом у
 * воркер, і перший запис може випередити міграції. Збій при цьому
 * тихий: `createApplyOps` ловить помилку кожної операції окремо, тож
 * запис «успішний», а в базі порожньо.
 *
 * Тут це ловить лише випадок — тест `deep-module-crud › fizruk` встигає
 * пізніше за міграції, — тож правку зроблено не за червоним гейтом, а
 * тому що місце ідентичне. Розбір: `routine/lib/dualWriteBoot.ts`.
 */
let migrationsApplied = false;

/**
 * Install the Fizruk dual-write context. Returns a teardown function.
 *
 * The resolvers are intentionally simple — see the routine variant
 * for the rationale on lazy sqlite resolution and live userId reads.
 */
export function bootFizrukDualWrite(
  input: BootFizrukDualWriteInput,
): () => void {
  const ctx: FizrukDualWriteContext = {
    getUserId: () => input.getUserId(),
    getMigrationClient: async (): Promise<SqliteMigrationClient | null> => {
      const handle = await getSqliteDb();
      const client = handle.migrationClient();
      if (!migrationsApplied) {
        await migrateFizruk(client);
        migrationsApplied = true;
      }
      return client;
    },
    getNow: () =>
      // eslint-disable-next-line no-restricted-syntax -- LWW clientTs wall-clock, not a Kyiv day key
      new Date().toISOString(),
  };
  return registerFizrukDualWriteContext(ctx);
}

/** Test-only escape hatch — clears the migrations-applied flag. */
export function __resetFizrukDualWriteBootForTests(): void {
  migrationsApplied = false;
}

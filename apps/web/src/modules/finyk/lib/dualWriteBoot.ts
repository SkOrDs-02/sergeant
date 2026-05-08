/**
 * Boot wiring for the Finyk dual-write context.
 *
 * Stage 4 PR #036 of `docs/planning/storage-roadmap.md`. Mirror of
 * `apps/web/src/modules/nutrition/lib/dualWriteBoot.ts`.
 *
 * Stage 8 PR #056k dropped the `feature.finyk.sqlite_v2.dual_write`
 * flag — registration is now `userId`-gated only.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import {
  registerFinykDualWriteContext,
  type FinykDualWriteContext,
} from "./dualWrite/index.js";
import { migrateFinyk } from "./clientMigrate.js";

export interface BootFinykDualWriteInput {
  getUserId(): string | null;
}

let migrationsApplied = false;

/**
 * Install the Finyk dual-write context. Returns a teardown function.
 */
export function bootFinykDualWrite(input: BootFinykDualWriteInput): () => void {
  const ctx: FinykDualWriteContext = {
    getUserId: () => input.getUserId(),
    getMigrationClient: async (): Promise<SqliteMigrationClient | null> => {
      const handle = await getSqliteDb();
      const client = handle.migrationClient();
      if (!migrationsApplied) {
        await migrateFinyk(client);
        migrationsApplied = true;
      }
      return client;
    },
    getNow: () => new Date().toISOString(),
  };
  return registerFinykDualWriteContext(ctx);
}

/** Test-only escape hatch — clears the migrations-applied flag. */
export function __resetFinykDualWriteBootForTests(): void {
  migrationsApplied = false;
}

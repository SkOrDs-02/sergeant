/**
 * Boot wiring for the mobile Finyk dual-write context.
 *
 * Stage 4 PR #036 of `docs/planning/storage-roadmap.md`. Mirror of
 * `apps/mobile/src/modules/nutrition/lib/dualWriteBoot.ts`.
 *
 * Stage 8 PR #056k dropped the `feature.finyk.sqlite_v2.dual_write`
 * flag — registration is now `userId`-gated only.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { getSqliteMigrationClient } from "@/core/db/sqlite";

import { migrateFinyk } from "./clientMigrate";
import {
  registerFinykDualWriteContext,
  type FinykDualWriteContext,
} from "./dualWrite";

export interface BootFinykDualWriteInput {
  getUserId(): string | null;
}

let migrationsApplied = false;

export function bootFinykDualWrite(input: BootFinykDualWriteInput): () => void {
  const ctx: FinykDualWriteContext = {
    getUserId: () => input.getUserId(),
    getMigrationClient: async (): Promise<SqliteMigrationClient | null> => {
      const client = await getSqliteMigrationClient();
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

/**
 * Boot wiring for the Nutrition dual-write context.
 *
 * Stage 4 PR #032 of `docs/planning/storage-roadmap.md`. Mirror of
 * `apps/web/src/modules/fizruk/lib/dualWriteBoot.ts`.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import {
  registerNutritionDualWriteContext,
  type NutritionDualWriteContext,
} from "./dualWrite/index.js";
import { migrateNutrition } from "./clientMigrate.js";

export interface BootNutritionDualWriteInput {
  getUserId(): string | null;
}

let migrationsApplied = false;

/**
 * Install the Nutrition dual-write context. Returns a teardown function.
 */
export function bootNutritionDualWrite(
  input: BootNutritionDualWriteInput,
): () => void {
  const ctx: NutritionDualWriteContext = {
    getUserId: () => input.getUserId(),
    getMigrationClient: async (): Promise<SqliteMigrationClient | null> => {
      const handle = await getSqliteDb();
      const client = handle.migrationClient();
      if (!migrationsApplied) {
        await migrateNutrition(client);
        migrationsApplied = true;
      }
      return client;
    },
    getNow: () => new Date().toISOString(),
  };
  return registerNutritionDualWriteContext(ctx);
}

/** Test-only escape hatch — clears the migrations-applied flag. */
export function __resetNutritionDualWriteBootForTests(): void {
  migrationsApplied = false;
}

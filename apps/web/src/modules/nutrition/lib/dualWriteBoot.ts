/**
 * Last validated: 2026-06-15
 * Status: Active
 * Boot wiring for the Nutrition dual-write context.
 *
 * Stage 4 PR #032 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. Mirror of
 * `apps/web/src/modules/fizruk/lib/dualWriteBoot.ts`.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import {
  registerNutritionDualWriteContext,
  type NutritionDualWriteContext,
} from "./sqliteWriter/index.js";
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

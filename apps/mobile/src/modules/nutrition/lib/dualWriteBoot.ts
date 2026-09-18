/**
 * Boot wiring for the mobile Nutrition dual-write context.
 *
 * Stage 4 PR #032 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. Mirror of
 * `apps/mobile/src/modules/fizruk/lib/dualWriteBoot.ts`. The MMKV write
 * paths in `nutritionStore.ts` and `recipeBookStore.ts` already
 * fire `triggerNutritionDualWrite(prev, next)` after every successful
 * write — this module installs the SQLite-side resolvers behind that
 * trigger.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { getSqliteMigrationClient } from "@/core/db/sqlite";

import { migrateNutrition } from "./clientMigrate";
import {
  registerNutritionDualWriteContext,
  type NutritionDualWriteContext,
} from "./sqliteWriter";

export interface BootNutritionDualWriteInput {
  getUserId(): string | null;
}

let migrationsApplied = false;

export function bootNutritionDualWrite(
  input: BootNutritionDualWriteInput,
): () => void {
  const ctx: NutritionDualWriteContext = {
    getUserId: () => input.getUserId(),
    getMigrationClient: async (): Promise<SqliteMigrationClient | null> => {
      const client = await getSqliteMigrationClient();
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

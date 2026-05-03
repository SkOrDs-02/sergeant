/**
 * Boot wiring for the Fizruk dual-write context (PR #028 follow-up).
 *
 * Stage 4 of `docs/planning/storage-roadmap.md`. PR #028 shipped the
 * Fizruk dual-write orchestrator and trigger but never installed the
 * context from the platform bootstrap — so the dual-write pipeline
 * stayed dormant in production. This module closes that gap. Mirror of
 * `apps/web/src/modules/routine/lib/dualWriteBoot.ts`.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import {
  registerFizrukDualWriteContext,
  type FizrukDualWriteContext,
} from "./dualWrite/index.js";

export interface BootFizrukDualWriteInput {
  getUserId(): string | null;
  isFlagEnabled(): boolean;
}

/**
 * Install the Fizruk dual-write context. Returns a teardown function.
 *
 * The resolvers are intentionally simple — see the routine variant
 * for the rationale on lazy sqlite resolution and live flag/userId
 * reads.
 */
export function bootFizrukDualWrite(
  input: BootFizrukDualWriteInput,
): () => void {
  const ctx: FizrukDualWriteContext = {
    isEnabled: () => input.isFlagEnabled(),
    getUserId: () => input.getUserId(),
    getMigrationClient: async (): Promise<SqliteMigrationClient | null> => {
      const handle = await getSqliteDb();
      return handle.migrationClient();
    },
    getNow: () => new Date().toISOString(),
  };
  return registerFizrukDualWriteContext(ctx);
}

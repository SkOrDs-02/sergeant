/**
 * Boot wiring for the mobile Fizruk dual-write context (PR #028 follow-up).
 *
 * Stage 4 of `docs/planning/storage-roadmap.md`. Mirror of
 * `apps/mobile/src/modules/routine/lib/dualWriteBoot.ts`. See that file
 * for the rationale.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { getSqliteMigrationClient } from "@/core/db/sqlite";

import {
  registerFizrukDualWriteContext,
  type FizrukDualWriteContext,
} from "./dualWrite";

export interface BootFizrukDualWriteInput {
  getUserId(): string | null;
  isFlagEnabled(): boolean;
}

export function bootFizrukDualWrite(
  input: BootFizrukDualWriteInput,
): () => void {
  const ctx: FizrukDualWriteContext = {
    isEnabled: () => input.isFlagEnabled(),
    getUserId: () => input.getUserId(),
    getMigrationClient: async (): Promise<SqliteMigrationClient | null> => {
      return getSqliteMigrationClient();
    },
    getNow: () => new Date().toISOString(),
  };
  return registerFizrukDualWriteContext(ctx);
}

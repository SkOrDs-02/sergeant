/**
 * Boot wiring for the mobile Fizruk dual-write context (PR #028 follow-up).
 *
 * Stage 4 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. Mirror of
 * `apps/mobile/src/modules/routine/lib/dualWriteBoot.ts`. See that file
 * for the rationale.
 *
 * Stage 8 PR #056f dropped the `isFlagEnabled` callback — the
 * `feature.fizruk.sqlite_v2.dual_write` flag was removed from the
 * registry once it had been default-on with no toggle path remaining.
 * Registration is now `userId`-gated only.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { getSqliteMigrationClient } from "@/core/db/sqlite";

import {
  registerFizrukDualWriteContext,
  type FizrukDualWriteContext,
} from "./sqliteWriter";

export interface BootFizrukDualWriteInput {
  getUserId(): string | null;
}

export function bootFizrukDualWrite(
  input: BootFizrukDualWriteInput,
): () => void {
  const ctx: FizrukDualWriteContext = {
    getUserId: () => input.getUserId(),
    getMigrationClient: async (): Promise<SqliteMigrationClient | null> => {
      return getSqliteMigrationClient();
    },
    getNow: () => new Date().toISOString(),
  };
  return registerFizrukDualWriteContext(ctx);
}

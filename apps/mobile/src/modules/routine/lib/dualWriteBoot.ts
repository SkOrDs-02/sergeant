/**
 * Boot wiring for the mobile routine dual-write context (PR #024 follow-up).
 *
 * Stage 4 of `docs/planning/storage-roadmap.md`. PR #024 shipped the
 * orchestrator + the MMKV-write trigger inside `routineStore.ts`, but
 * never installed the context from the platform bootstrap — so the
 * dual-write pipeline stayed dormant in production. Mobile mirror of
 * `apps/web/src/modules/routine/lib/dualWriteBoot.ts`.
 *
 * Mobile flag access is synchronous via the shared MMKV blob (`@hub_flags_v1`),
 * not a React hook, so the React layer reads the live flag value on
 * every dual-write trigger via `isFlagEnabled()`. The hook
 * (`useRoutineDualWriteBoot`) re-registers when `useFlag` reports a
 * change so `isRoutineDualWriteRegistered()` stays in sync with the
 * persisted toggle for the LS-side `peekRoutineDualWritePrev` shortcut.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { getSqliteMigrationClient } from "@/core/db/sqlite";

import {
  registerRoutineDualWriteContext,
  type RoutineDualWriteContext,
} from "./dualWrite";

export interface BootRoutineDualWriteInput {
  getUserId(): string | null;
  isFlagEnabled(): boolean;
}

/**
 * Install the routine dual-write context. Returns a teardown function.
 *
 * The migration client is resolved lazily on the first SQLite write —
 * `getSqliteMigrationClient()` awaits `initSqlite()` internally, so
 * the native handle is never opened until the dual-write pipeline
 * actually fires.
 */
export function bootRoutineDualWrite(
  input: BootRoutineDualWriteInput,
): () => void {
  const ctx: RoutineDualWriteContext = {
    isEnabled: () => input.isFlagEnabled(),
    getUserId: () => input.getUserId(),
    getMigrationClient: async (): Promise<SqliteMigrationClient | null> => {
      return getSqliteMigrationClient();
    },
    getNow: () => new Date().toISOString(),
  };
  return registerRoutineDualWriteContext(ctx);
}

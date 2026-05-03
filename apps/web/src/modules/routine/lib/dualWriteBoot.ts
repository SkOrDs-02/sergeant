/**
 * Boot wiring for the routine dual-write context (PR #024 follow-up).
 *
 * Stage 4 of `docs/planning/storage-roadmap.md`. PR #024 shipped the
 * dual-write orchestrator (`registerRoutineDualWriteContext`) and the
 * `routineStorage.ts` trigger, but never installed the context from
 * the platform bootstrap — so the dual-write pipeline stayed dormant
 * in production even with the flag flipped on. This module closes that
 * gap by handing back a `register / teardown` pair the React layer can
 * call from `RoutineApp` once the user is known and the React-Query
 * `me` cache + sqlite singleton are reachable.
 *
 * Why not register from `main.tsx` directly:
 *
 *  - `getUserId` must read from the React-Query cache that lives below
 *    `<App />`, so the registration has to happen after the provider
 *    tree mounts. A React hook is the cleanest cut.
 *  - The flag value is reactive — `useFlag(...)` re-renders the call
 *    site when the user toggles the experiment in Settings. Treating
 *    `flag` as a dependency lets us register/de-register on toggle
 *    without a page reload, which keeps `isRoutineDualWriteRegistered()`
 *    honest (the LS-write layer reads previous state only when the
 *    context is installed).
 *
 * The actual `registerRoutineDualWriteContext` is provided by the
 * dual-write barrel; this module is purely the wiring layer.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import {
  registerRoutineDualWriteContext,
  type RoutineDualWriteContext,
} from "./dualWrite/index.js";

/**
 * Inputs the boot helper needs from the React layer.
 *
 * `getUserId` is captured as a callback (not a string) so the live
 * value from the `me` cache is read at call time rather than at
 * registration time — auth state can change without re-registration.
 */
export interface BootRoutineDualWriteInput {
  getUserId(): string | null;
  isFlagEnabled(): boolean;
}

/**
 * Install the routine dual-write context.
 *
 * Returns a teardown function. Callers should treat the return value as
 * `useEffect` cleanup so toggling the flag off in Settings (or
 * unmounting the module shell) clears the context and the LS-write
 * layer can drop its `peekRoutineDualWritePrev` overhead immediately.
 *
 * The context's resolvers are intentionally simple:
 *  - `isEnabled` calls back into `isFlagEnabled` so a flag toggle
 *    between writes is observed without re-registration; the React
 *    hook _also_ swaps the registration on flag change so
 *    `isRoutineDualWriteRegistered()` reflects the live truth.
 *  - `getMigrationClient` resolves the lazy sqlite-wasm singleton on
 *    first write — never on registration — so the SQLite chunk doesn't
 *    download until the first dual-write actually fires.
 */
export function bootRoutineDualWrite(
  input: BootRoutineDualWriteInput,
): () => void {
  const ctx: RoutineDualWriteContext = {
    isEnabled: () => input.isFlagEnabled(),
    getUserId: () => input.getUserId(),
    getMigrationClient: async (): Promise<SqliteMigrationClient | null> => {
      const handle = await getSqliteDb();
      return handle.migrationClient();
    },
    getNow: () => new Date().toISOString(),
  };
  return registerRoutineDualWriteContext(ctx);
}

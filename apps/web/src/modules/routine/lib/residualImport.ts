/**
 * Boot-time residual-import helper for the Routine LS key.
 *
 * Stage 8 PR #057r-tombstone of `docs/planning/storage-roadmap.md`.
 * Reads any leftover routine state from the now-deprecated
 * `STORAGE_KEYS.ROUTINE` (`hub_routine_v1`) blob, imports it into the
 * 7 routine_* SQLite tables (idempotent + LWW-safe), and then deletes
 * the LS entry. Subsequent boots no-op because the LS key is gone.
 *
 * The import uses a deliberately stale `clientTs` (epoch zero) so the
 * adapter's LWW guard always lets existing SQLite rows win — we never
 * clobber newer SQLite data with a stale LS snapshot.
 *
 * Mirror of `apps/web/src/modules/fizruk/lib/residualImport.ts`
 * (PR #057f-tombstone) and
 * `apps/web/src/modules/finyk/lib/residualImport.ts`
 * (PR #057k-tombstone). A mobile MMKV → SQLite drain ships once the
 * mobile dual-write extension reaches Stage 10 parity (separate PR —
 * mobile dual-write is currently completion-only, so a mobile
 * tombstone would silently drop habits / tags / categories / prefs /
 * pushups / habitOrder / completionNotes).
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import {
  defaultRoutineState,
  normalizeRoutineState,
  ROUTINE_STORAGE_KEY,
  type RoutineState,
} from "@sergeant/routine-domain";

import { applyRoutineDualWriteOps } from "./dualWrite/adapter.js";
import { diffRoutineDualWriteOps } from "./dualWrite/diff.js";
import { routineStorage } from "./routineStorageInstance.js";

const STALE_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export interface ResidualImportResult {
  /** `true` when the LS key held data that produced ops. */
  readonly imported: boolean;
  /** `true` when the LS key was present and has been deleted. */
  readonly cleaned: boolean;
}

/**
 * Import any residual Routine LS data into SQLite, then delete the
 * LS entry. Always returns successfully — failures fall back to a
 * no-op so the boot path can keep going.
 */
export async function importRoutineResidualFromLs(
  client: SqliteMigrationClient,
  userId: string,
): Promise<ResidualImportResult> {
  const lsState = readRoutineStateFromLs();
  if (lsState === null) return { imported: false, cleaned: false };

  // Diff the residual LS snapshot against an empty `defaultRoutineState`
  // so the dual-write op stream emits upserts for everything the LS
  // blob contained. The adapter's LWW guard plus the stale
  // `STALE_TIMESTAMP` ensures any existing SQLite row beats the
  // residual import — we never overwrite newer SQLite data with a
  // stale LS snapshot.
  const ops = diffRoutineDualWriteOps(defaultRoutineState(), lsState);

  if (ops.length > 0) {
    try {
      await applyRoutineDualWriteOps(client, ops, {
        userId,
        clientTs: STALE_TIMESTAMP,
      });
    } catch (err) {
      console.warn(
        "[routine.residualImport] apply failed; LS key retained",
        err instanceof Error ? err.message : err,
      );
      return { imported: false, cleaned: false };
    }
  }

  // Delete the LS key after a successful import (or empty payload) so
  // a half-cleared LS state can't keep retriggering the import on
  // every boot.
  routineStorage.removeItem(ROUTINE_STORAGE_KEY);

  return { imported: ops.length > 0, cleaned: true };
}

// -----------------------------------------------------------------------
// LS reader — defensive: any throw collapses to `null` so the import
// proceeds with whatever else was readable. Returning `null` means
// "key absent / unreadable"; an empty default state means "key
// present but content was malformed / already empty".
// -----------------------------------------------------------------------

function readRoutineStateFromLs(): RoutineState | null {
  try {
    const raw = routineStorage.readJSON<unknown>(ROUTINE_STORAGE_KEY, null);
    if (raw == null) return null;
    return normalizeRoutineState(raw);
  } catch {
    return null;
  }
}

// Internal exports for tests.
export const __testing = {
  STALE_TIMESTAMP,
  readRoutineStateFromLs,
};

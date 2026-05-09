/**
 * Boot-time residual-import helper for the mobile Routine MMKV key.
 *
 * Stage 8 PR #057r-tombstone-mobile of `docs/planning/storage-roadmap.md`
 * (mobile parity for `apps/web/src/modules/routine/lib/residualImport.ts`).
 * Reads any leftover routine state from the now-deprecated MMKV
 * `ROUTINE_STORAGE_KEY` (`hub_routine_v1`) blob, imports it into the
 * 7 routine_* SQLite tables (idempotent + LWW-safe) via the dual-write
 * pipeline, and then deletes the MMKV entry. Subsequent boots no-op
 * because the MMKV key is gone.
 *
 * The import uses a deliberately stale `clientTs` (epoch zero) so the
 * adapter's LWW guard always lets existing SQLite rows win — we never
 * clobber newer SQLite data with a stale MMKV snapshot.
 *
 * Mirror of `apps/web/src/modules/routine/lib/residualImport.ts`
 * (PR #057r-tombstone web). Only callsite in mobile that is allowed
 * to touch the now-deprecated `STORAGE_KEYS.ROUTINE` MMKV slot.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import {
  defaultRoutineState,
  normalizeRoutineState,
  ROUTINE_STORAGE_KEY,
  type RoutineState,
} from "@sergeant/routine-domain";

import { safeReadLS, safeRemoveLS } from "@/lib/storage";

import { applyRoutineDualWriteOps } from "./dualWrite/adapter";
import { diffRoutineDualWriteOps } from "./dualWrite/diff";

const STALE_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export interface ResidualImportResult {
  /** `true` when the MMKV key held data that produced ops. */
  readonly imported: boolean;
  /** `true` when the MMKV key was present and has been deleted. */
  readonly cleaned: boolean;
}

/**
 * Import any residual Routine MMKV data into SQLite, then delete the
 * MMKV entry. Always returns successfully — failures fall back to a
 * no-op so the boot path can keep going.
 */
export async function importRoutineResidualFromMmkv(
  client: SqliteMigrationClient,
  userId: string,
): Promise<ResidualImportResult> {
  const mmkvState = readRoutineStateFromMmkv();
  if (mmkvState === null) return { imported: false, cleaned: false };

  // Diff the residual MMKV snapshot against an empty `defaultRoutineState`
  // so the dual-write op stream emits upserts for everything the MMKV
  // blob contained. The adapter's LWW guard plus the stale
  // `STALE_TIMESTAMP` ensures any existing SQLite row beats the
  // residual import — we never overwrite newer SQLite data with a
  // stale MMKV snapshot.
  const ops = diffRoutineDualWriteOps(defaultRoutineState(), mmkvState);

  if (ops.length > 0) {
    try {
      await applyRoutineDualWriteOps(client, ops, {
        userId,
        clientTs: STALE_TIMESTAMP,
      });
    } catch (err) {
      console.warn(
        "[routine.residualImport] apply failed; MMKV key retained",
        err instanceof Error ? err.message : err,
      );
      return { imported: false, cleaned: false };
    }
  }

  // Delete the MMKV key after a successful import (or empty payload) so
  // a half-cleared MMKV state can't keep retriggering the import on
  // every boot.
  safeRemoveLS(ROUTINE_STORAGE_KEY);

  return { imported: ops.length > 0, cleaned: true };
}

// -----------------------------------------------------------------------
// MMKV reader — defensive: any throw collapses to `null` so the import
// proceeds with whatever else was readable. Returning `null` means
// "key absent / unreadable"; an empty default state means "key
// present but content was malformed / already empty".
// -----------------------------------------------------------------------

function readRoutineStateFromMmkv(): RoutineState | null {
  try {
    const raw = safeReadLS<unknown>(ROUTINE_STORAGE_KEY, null);
    if (raw == null) return null;
    return normalizeRoutineState(raw);
  } catch {
    return null;
  }
}

// Internal exports for tests.
export const __testing = {
  STALE_TIMESTAMP,
  readRoutineStateFromMmkv,
};

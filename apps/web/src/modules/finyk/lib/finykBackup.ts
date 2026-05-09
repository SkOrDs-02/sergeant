/**
 * Finyk backup — web storage adapter.
 *
 * Stage 8 PR #057k-tombstone: reads now prefer the SQLite cache
 * (`getCachedFinykSqliteState()`) over LS. LS writes in
 * `persistFinykNormalizedToStorage` are retained for the Hub-backup
 * import path (non-React context) — the residual-import helper in
 * `sqliteReadBoot.ts` picks them up on next boot and drains them into
 * SQLite.
 *
 * The pure normalize / version / payload-shape logic lives in
 * `@sergeant/finyk-domain/backup` so the mobile app can reuse it
 * without depending on localStorage.
 */

import { DEFAULT_SUBSCRIPTIONS } from "../constants";
import { notifyFinykRoutineCalendarSync } from "../hubRoutineSync";
import { readJSON, writeJSON } from "./finykStorage";
import { getCachedFinykSqliteState } from "./sqliteReader";
import {
  DEFAULT_FINYK_MONTHLY_PLAN,
  FINYK_BACKUP_VERSION,
  FINYK_FIELD_TO_STORAGE_KEY,
  normalizeFinykBackup,
  normalizeFinykSyncPayload,
  type FinykBackup,
} from "@sergeant/finyk-domain/backup";

export {
  FINYK_BACKUP_VERSION,
  normalizeFinykBackup,
  normalizeFinykSyncPayload,
};
export type { FinykBackup };

/**
 * Snapshot of current Finyk data for backup export.
 *
 * Stage 8 PR #057k-tombstone: prefers the warm SQLite cache (the
 * canonical source after the LS tombstone). Falls back to LS for
 * fields not yet in the cache or when the cache hasn't warmed.
 * `dismissedRecurring` is still LS-only (no SQLite column yet).
 */
export function readFinykBackupFromStorage() {
  const cache = getCachedFinykSqliteState();
  const warm = cache.refreshedAt !== null;

  return {
    version: FINYK_BACKUP_VERSION,
    budgets: warm
      ? cache.budgets
      : readJSON(FINYK_FIELD_TO_STORAGE_KEY.budgets, []),
    subscriptions: warm
      ? cache.subscriptions
      : readJSON(
          FINYK_FIELD_TO_STORAGE_KEY.subscriptions,
          DEFAULT_SUBSCRIPTIONS,
        ),
    manualAssets: warm
      ? cache.manualAssets
      : readJSON(FINYK_FIELD_TO_STORAGE_KEY.manualAssets, []),
    manualDebts: warm
      ? cache.manualDebts
      : readJSON(FINYK_FIELD_TO_STORAGE_KEY.manualDebts, []),
    receivables: warm
      ? cache.receivables
      : readJSON(FINYK_FIELD_TO_STORAGE_KEY.receivables, []),
    hiddenAccounts: warm
      ? cache.hiddenAccounts
      : readJSON(FINYK_FIELD_TO_STORAGE_KEY.hiddenAccounts, []),
    hiddenTxIds: warm
      ? cache.hiddenTransactions
      : readJSON(FINYK_FIELD_TO_STORAGE_KEY.hiddenTxIds, []),
    monthlyPlan:
      warm && cache.monthlyPlan !== null
        ? cache.monthlyPlan
        : readJSON(FINYK_FIELD_TO_STORAGE_KEY.monthlyPlan, {
            ...DEFAULT_FINYK_MONTHLY_PLAN,
          }),
    txCategories: warm
      ? cache.txCategories
      : readJSON(FINYK_FIELD_TO_STORAGE_KEY.txCategories, {}),
    txSplits: warm
      ? cache.txSplits
      : readJSON(FINYK_FIELD_TO_STORAGE_KEY.txSplits, {}),
    monoDebtLinkedTxIds: warm
      ? cache.monoDebtLinkedTxIds
      : readJSON(FINYK_FIELD_TO_STORAGE_KEY.monoDebtLinkedTxIds, {}),
    networthHistory: warm
      ? cache.networthHistory
      : readJSON(FINYK_FIELD_TO_STORAGE_KEY.networthHistory, []),
    customCategories: warm
      ? cache.customCategories
      : readJSON(FINYK_FIELD_TO_STORAGE_KEY.customCategories, []),
    // `dismissedRecurring` is still LS-only — no SQLite column yet.
    dismissedRecurring: readJSON(
      FINYK_FIELD_TO_STORAGE_KEY.dismissedRecurring,
      [],
    ),
  };
}

/**
 * Writes a normalised Finyk backup to localStorage. Used by the
 * Hub-backup import path (`hubBackup.ts`) which runs outside of
 * React. The residual-import helper in `sqliteReadBoot.ts` drains
 * these LS keys into SQLite on the next boot.
 */
export function persistFinykNormalizedToStorage(normalized: FinykBackup): void {
  for (const [field, storageKey] of Object.entries(
    FINYK_FIELD_TO_STORAGE_KEY,
  )) {
    const value = (normalized as Record<string, unknown>)[field];
    if (value !== undefined) {
      writeJSON(storageKey, value);
    }
  }
  notifyFinykRoutineCalendarSync();
}

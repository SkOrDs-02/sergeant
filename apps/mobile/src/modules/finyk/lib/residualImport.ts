/**
 * Boot-time residual-import helper for the mobile Finyk MMKV keys.
 *
 * Stage 8 PR #057k-tombstone of `docs/planning/storage-roadmap.md`
 * (mobile parity for `apps/web/src/modules/finyk/lib/residualImport.ts`).
 * Reads any leftover values from the now-deprecated MMKV keys (14
 * Finyk domain keys + `finyk_show_balance_v1`), imports them into the
 * local `finyk_*` SQLite tables (idempotent + LWW-safe), and then
 * deletes the MMKV entries. Subsequent boots no-op because the MMKV
 * keys are gone.
 *
 * The import uses a deliberately stale `clientTs` (epoch zero) so the
 * adapter's LWW guard always lets existing SQLite rows win -- we never
 * clobber newer SQLite data with a stale MMKV snapshot.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { STORAGE_KEYS } from "@sergeant/shared";

import { safeReadLS, safeRemoveLS } from "@/lib/storage";

import { applyFinykDualWriteOps } from "./dualWrite/adapter";
import {
  EMPTY_FINYK_STATE,
  diffFinykDualWriteOps,
  type FinykDualWriteState,
  type FinykPrefsSnapshot,
} from "./dualWrite/diff";
import {
  blobsFromArray,
  idsFromArray,
  monoDebtLinksFromMap,
  networthHistoryFrom,
  txCatsFromMap,
  txSplitsFromMap,
} from "./dualWrite/extract";

const STALE_TIMESTAMP = "1970-01-01T00:00:00.000Z";

const ALL_KEYS = [
  STORAGE_KEYS.FINYK_HIDDEN,
  STORAGE_KEYS.FINYK_HIDDEN_TXS,
  STORAGE_KEYS.FINYK_BUDGETS,
  STORAGE_KEYS.FINYK_SUBS,
  STORAGE_KEYS.FINYK_ASSETS,
  STORAGE_KEYS.FINYK_DEBTS,
  STORAGE_KEYS.FINYK_RECV,
  STORAGE_KEYS.FINYK_CUSTOM_CATS,
  STORAGE_KEYS.FINYK_MANUAL_EXPENSES,
  STORAGE_KEYS.FINYK_TX_CATS,
  STORAGE_KEYS.FINYK_TX_SPLITS,
  STORAGE_KEYS.FINYK_MONO_DEBT_LINKED,
  STORAGE_KEYS.FINYK_NETWORTH_HISTORY,
  STORAGE_KEYS.FINYK_MONTHLY_PLAN,
  STORAGE_KEYS.FINYK_SHOW_BALANCE,
];

export interface ResidualImportResult {
  readonly imported: boolean;
  readonly cleaned: boolean;
}

/**
 * Import any residual Finyk MMKV data into SQLite, then delete the
 * MMKV entries. Always returns successfully -- failures fall back to a
 * no-op so the boot path can keep going.
 */
export async function importFinykResidualFromMmkv(
  client: SqliteMigrationClient,
  userId: string,
): Promise<ResidualImportResult> {
  const hasAny = ALL_KEYS.some(
    (key) => safeReadLS<unknown>(key, null) !== null,
  );
  if (!hasAny) return { imported: false, cleaned: false };

  const next = buildStateFromMmkv();
  if (!next) return { imported: false, cleaned: false };

  const ops = diffFinykDualWriteOps(EMPTY_FINYK_STATE, next);

  if (ops.length > 0) {
    try {
      await applyFinykDualWriteOps(client, ops, {
        userId,
        clientTs: STALE_TIMESTAMP,
      });
    } catch (err) {
      console.warn(
        "[finyk.residualImport] apply failed; MMKV keys retained",
        err instanceof Error ? err.message : err,
      );
      return { imported: false, cleaned: false };
    }
  }

  for (const key of ALL_KEYS) {
    safeRemoveLS(key);
  }

  return { imported: ops.length > 0, cleaned: true };
}

// -----------------------------------------------------------------------
// Build FinykDualWriteState from MMKV using the shared extract helpers.
// -----------------------------------------------------------------------

function buildStateFromMmkv(): FinykDualWriteState | null {
  try {
    return {
      hiddenAccounts: idsFromArray(
        safeReadLS<string[]>(STORAGE_KEYS.FINYK_HIDDEN, null) ?? [],
      ),
      hiddenTransactions: idsFromArray(
        safeReadLS<string[]>(STORAGE_KEYS.FINYK_HIDDEN_TXS, null) ?? [],
      ),
      budgets: blobsFromArray(
        safeReadLS<unknown[]>(STORAGE_KEYS.FINYK_BUDGETS, null) ?? [],
      ),
      subscriptions: blobsFromArray(
        safeReadLS<unknown[]>(STORAGE_KEYS.FINYK_SUBS, null) ?? [],
      ),
      assets: blobsFromArray(
        safeReadLS<unknown[]>(STORAGE_KEYS.FINYK_ASSETS, null) ?? [],
      ),
      debts: blobsFromArray(
        safeReadLS<unknown[]>(STORAGE_KEYS.FINYK_DEBTS, null) ?? [],
      ),
      receivables: blobsFromArray(
        safeReadLS<unknown[]>(STORAGE_KEYS.FINYK_RECV, null) ?? [],
      ),
      customCategories: blobsFromArray(
        safeReadLS<unknown[]>(STORAGE_KEYS.FINYK_CUSTOM_CATS, null) ?? [],
      ),
      manualExpenses: blobsFromArray(
        safeReadLS<unknown[]>(STORAGE_KEYS.FINYK_MANUAL_EXPENSES, null) ?? [],
      ),
      txCategories: txCatsFromMap(
        safeReadLS<Record<string, string>>(STORAGE_KEYS.FINYK_TX_CATS, null) ??
          {},
      ),
      txSplits: txSplitsFromMap(
        safeReadLS<Record<string, unknown>>(
          STORAGE_KEYS.FINYK_TX_SPLITS,
          null,
        ) ?? {},
      ),
      monoDebtLinks: monoDebtLinksFromMap(
        safeReadLS<Record<string, string[]>>(
          STORAGE_KEYS.FINYK_MONO_DEBT_LINKED,
          null,
        ) ?? {},
      ),
      networthHistory: networthHistoryFrom(
        safeReadLS<Array<{ month?: unknown; networth?: unknown }>>(
          STORAGE_KEYS.FINYK_NETWORTH_HISTORY,
          null,
        ) ?? [],
      ),
      prefs: readPrefsFromMmkv(),
    };
  } catch {
    return null;
  }
}

function readPrefsFromMmkv(): FinykPrefsSnapshot {
  const rawPlan = safeReadLS<unknown>(STORAGE_KEYS.FINYK_MONTHLY_PLAN, null);
  let monthlyPlanJson: string;
  try {
    monthlyPlanJson = JSON.stringify(rawPlan ?? {});
  } catch {
    monthlyPlanJson = "{}";
  }

  const showBalanceRaw = safeReadLS<unknown>(
    STORAGE_KEYS.FINYK_SHOW_BALANCE,
    true,
  );
  const showBalance =
    typeof showBalanceRaw === "boolean" ? showBalanceRaw : true;

  // Stage 13 / PR #075 — мобілка не тримала ці LS-ключі, тож стартує
  // з порожніми масивами; пуш з вебу пізніше перезапише через LWW.
  return {
    monthlyPlanJson,
    showBalance,
    excludedStatTxIdsJson: "[]",
    dismissedRecurringJson: "[]",
  };
}

export const __testing = {
  STALE_TIMESTAMP,
  ALL_KEYS,
};

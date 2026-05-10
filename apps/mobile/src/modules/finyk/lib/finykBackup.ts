/**
 * Mobile Finyk — backup payload helpers.
 *
 * Stage 13 PR #071 of `docs/planning/storage-roadmap.md` — mirror of
 * `apps/web/src/modules/finyk/lib/finykBackup.ts`. After Stage 8 PR
 * #057k-tombstone the Finyk MMKV slots are empty (the residual-import
 * helper drained them into SQLite once and deleted the keys), so the
 * prior `safeReadLS` / `safeWriteLS` pass-through in `hubBackup.ts`
 * read empty data on export and never moved the imported payload into
 * the SQLite tables that every Finyk hook actually consumes.
 *
 * Read path:    SQLite warm cache → `FinykBackup` shape.
 * Apply path:   normalised `FinykBackup` → `FinykDualWriteState`
 *               diff vs. `EMPTY_FINYK_STATE` → fresh-`Date.now()`
 *               op-log batch via `triggerFinykDualWrite`.
 */

import type { FinykBackup } from "@sergeant/finyk-domain/backup";

import { triggerFinykDualWrite } from "./dualWrite";
import {
  EMPTY_FINYK_STATE,
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
import { getCachedFinykSqliteState } from "./sqliteReader";

/**
 * Snapshot of current Finyk data for backup export. Reads from the
 * SQLite warm cache populated by `useFinykSqliteReadBoot`. Pre-boot
 * the cache returns empty arrays / `null` singletons so the payload
 * still validates on import.
 */
export function readFinykBackupFromCache(): FinykBackup {
  const cache = getCachedFinykSqliteState();
  return {
    version: 2,
    budgets: cache.budgets,
    subscriptions: cache.subscriptions,
    manualAssets: cache.manualAssets,
    manualDebts: cache.manualDebts,
    receivables: cache.receivables,
    hiddenAccounts: cache.hiddenAccounts,
    hiddenTxIds: cache.hiddenTransactions,
    monthlyPlan: monthlyPlanToRecord(cache.monthlyPlan),
    txCategories: cache.txCategories,
    txSplits: cache.txSplits,
    monoDebtLinkedTxIds: cache.monoDebtLinkedTxIds,
    networthHistory: cache.networthHistory,
    customCategories: cache.customCategories,
    // `dismissedRecurring` mirrors the cross-device prefs slice
    // (Stage 13 / PR #075). Default to `[]` until the prefs row warms.
    dismissedRecurring: cache.dismissedRecurring ?? [],
  };
}

/**
 * Persist a normalised Finyk backup. Routes every slice through the
 * dual-write trigger so the SQLite tables become source of truth and
 * the warm cache reflects the restored payload on the next refresh
 * tick. Op-log timestamps come from the registered context's
 * `getNow()` (= `Date.now()` ISO), so the LWW guard accepts them.
 */
export function persistFinykNormalizedToStorage(normalized: FinykBackup): void {
  const next = buildStateFromBackup(normalized);
  triggerFinykDualWrite(EMPTY_FINYK_STATE, next);
}

function buildStateFromBackup(b: FinykBackup): FinykDualWriteState {
  return {
    hiddenAccounts: idsFromArray(asStringArray(b.hiddenAccounts)),
    hiddenTransactions: idsFromArray(asStringArray(b.hiddenTxIds)),
    budgets: blobsFromArray(b.budgets ?? []),
    subscriptions: blobsFromArray(b.subscriptions ?? []),
    assets: blobsFromArray(b.manualAssets ?? []),
    debts: blobsFromArray(b.manualDebts ?? []),
    receivables: blobsFromArray(b.receivables ?? []),
    customCategories: blobsFromArray(b.customCategories ?? []),
    // `manualExpenses` is not part of the JSON backup envelope — only
    // 14 of the 15 dual-write tables are exported. Skip the slice here
    // so the diff against EMPTY produces no manual-expenses ops; an
    // import never wipes existing rows.
    manualExpenses: [],
    txCategories: txCatsFromMap(asStringMap(b.txCategories)),
    txSplits: txSplitsFromMap(b.txSplits ?? {}),
    monoDebtLinks: monoDebtLinksFromMap(asMonoDebtMap(b.monoDebtLinkedTxIds)),
    networthHistory: networthHistoryFrom(asNetworthArray(b.networthHistory)),
    prefs: prefsFromBackup(b),
  };
}

function prefsFromBackup(b: FinykBackup): FinykPrefsSnapshot | null {
  // Avoid emitting a prefs op when none of the slots are present.
  // `monthlyPlan === undefined` and `dismissedRecurring === undefined`
  // both mean "the legacy backup didn't carry the field" — leaving
  // `prefs: null` preserves whatever the SQLite row already holds.
  if (b.monthlyPlan === undefined && b.dismissedRecurring === undefined) {
    return null;
  }
  let monthlyPlanJson: string;
  try {
    monthlyPlanJson = JSON.stringify(b.monthlyPlan ?? {});
  } catch {
    monthlyPlanJson = "{}";
  }
  let dismissedRecurringJson: string;
  try {
    const arr = Array.isArray(b.dismissedRecurring)
      ? b.dismissedRecurring.filter((v): v is string => typeof v === "string")
      : [];
    dismissedRecurringJson = JSON.stringify(arr);
  } catch {
    dismissedRecurringJson = "[]";
  }
  return {
    monthlyPlanJson,
    showBalance: true,
    excludedStatTxIdsJson: "[]",
    dismissedRecurringJson,
  };
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string" && x.length > 0) out.push(x);
  }
  return out;
}

function asStringMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string" && val.length > 0) out[k] = val;
  }
  return out;
}

function asMonoDebtMap(v: unknown): Record<string, string[]> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string[]> = {};
  for (const [k, val] of Object.entries(v)) {
    if (Array.isArray(val)) {
      const ids: string[] = [];
      for (const id of val) {
        if (typeof id === "string" && id.length > 0) ids.push(id);
      }
      if (ids.length > 0) out[k] = ids;
    }
  }
  return out;
}

function monthlyPlanToRecord(
  plan: { income?: number; expense?: number } | null,
): Record<string, unknown> | undefined {
  if (plan === null) return undefined;
  const out: Record<string, unknown> = {};
  if (plan.income !== undefined) out.income = plan.income;
  if (plan.expense !== undefined) out.expense = plan.expense;
  return out;
}

function asNetworthArray(
  v: unknown,
): Array<{ month?: unknown; networth?: unknown }> {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is { month?: unknown; networth?: unknown } =>
      x !== null && typeof x === "object",
  );
}

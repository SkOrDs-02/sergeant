/**
 * Boot-time residual-import helper for the Finyk LS keys.
 *
 * Stage 8 PR #057k-tombstone of `docs/planning/storage-roadmap.md`.
 * Reads any leftover values from the now-deprecated LS keys (14 Finyk
 * domain keys + `finyk_show_balance_v1`), imports them into the local
 * `finyk_*` SQLite tables (idempotent + LWW-safe), and then deletes
 * the LS entries. Subsequent boots no-op because the LS keys are gone.
 *
 * The import uses a deliberately stale `clientTs` (epoch zero) so the
 * adapter's LWW guard always lets existing SQLite rows win -- we never
 * clobber newer SQLite data with a stale LS snapshot.
 *
 * Mirror of `apps/web/src/modules/fizruk/lib/residualImport.ts`
 * (PR #057f-tombstone). Mobile parity lives at
 * `apps/mobile/src/modules/finyk/lib/residualImport.ts`.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { readJSON, readRaw, removeItem } from "./finykStorage";
import { applyFinykDualWriteOps } from "./dualWrite/adapter.js";
import {
  EMPTY_FINYK_STATE,
  diffFinykDualWriteOps,
  type FinykBlobEntry,
  type FinykDualWriteState,
  type FinykIdEntry,
  type FinykMonoDebtLinkEntry,
  type FinykNetworthEntry,
  type FinykTxCategoryEntry,
  type FinykTxSplitsEntry,
} from "./dualWrite/diff.js";

const STALE_TIMESTAMP = "1970-01-01T00:00:00.000Z";

// LS key constants for the 14 dual-write-covered keys + showBalance.
const LS_HIDDEN = "finyk_hidden";
const LS_HIDDEN_TXS = "finyk_hidden_txs";
const LS_BUDGETS = "finyk_budgets";
const LS_SUBS = "finyk_subs";
const LS_ASSETS = "finyk_assets";
const LS_DEBTS = "finyk_debts";
const LS_RECV = "finyk_recv";
const LS_CUSTOM_CATS = "finyk_custom_cats_v1";
const LS_MANUAL_EXPENSES = "finyk_manual_expenses_v1";
const LS_TX_CATS = "finyk_tx_cats";
const LS_TX_SPLITS = "finyk_tx_splits";
const LS_MONO_DEBT_LINKED = "finyk_mono_debt_linked";
const LS_NETWORTH_HISTORY = "finyk_networth_history";
const LS_MONTHLY_PLAN = "finyk_monthly_plan";
const LS_SHOW_BALANCE = "finyk_show_balance_v1";

const ALL_KEYS = [
  LS_HIDDEN,
  LS_HIDDEN_TXS,
  LS_BUDGETS,
  LS_SUBS,
  LS_ASSETS,
  LS_DEBTS,
  LS_RECV,
  LS_CUSTOM_CATS,
  LS_MANUAL_EXPENSES,
  LS_TX_CATS,
  LS_TX_SPLITS,
  LS_MONO_DEBT_LINKED,
  LS_NETWORTH_HISTORY,
  LS_MONTHLY_PLAN,
  LS_SHOW_BALANCE,
];

export interface ResidualImportResult {
  readonly imported: boolean;
  readonly cleaned: boolean;
}

/**
 * Import any residual Finyk LS data into SQLite, then delete the LS
 * entries. Always returns successfully -- failures fall back to a
 * no-op so the boot path can keep going.
 */
export async function importFinykResidualFromLs(
  client: SqliteMigrationClient,
  userId: string,
): Promise<ResidualImportResult> {
  const hasAny = ALL_KEYS.some((key) => readRaw(key, null) !== null);
  if (!hasAny) return { imported: false, cleaned: false };

  const next = buildStateFromLs();
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
        "[finyk.residualImport] apply failed; LS keys retained",
        err instanceof Error ? err.message : err,
      );
      return { imported: false, cleaned: false };
    }
  }

  // Delete all LS keys after a successful import. Done unconditionally
  // (even when ops.length === 0) so a half-cleared LS state can't keep
  // retriggering the import on every boot.
  for (const key of ALL_KEYS) {
    removeItem(key);
  }

  return { imported: ops.length > 0, cleaned: true };
}

// -----------------------------------------------------------------------
// Build FinykDualWriteState from LS — mirrors extractFinykDualWriteState
// but reads directly from LS rather than React slot values.
// -----------------------------------------------------------------------

function buildStateFromLs(): FinykDualWriteState | null {
  try {
    return {
      hiddenAccounts: readIdsFromLs(LS_HIDDEN),
      hiddenTransactions: readIdsFromLs(LS_HIDDEN_TXS),
      budgets: readBlobsFromLs(LS_BUDGETS),
      subscriptions: readBlobsFromLs(LS_SUBS),
      assets: readBlobsFromLs(LS_ASSETS),
      debts: readBlobsFromLs(LS_DEBTS),
      receivables: readBlobsFromLs(LS_RECV),
      customCategories: readBlobsFromLs(LS_CUSTOM_CATS),
      manualExpenses: readBlobsFromLs(LS_MANUAL_EXPENSES),
      txCategories: readTxCatsFromLs(),
      txSplits: readTxSplitsFromLs(),
      monoDebtLinks: readMonoDebtLinksFromLs(),
      networthHistory: readNetworthFromLs(),
      prefs: readPrefsFromLs(),
    };
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------
// Per-slot LS readers — defensive: any throw collapses to empty.
// -----------------------------------------------------------------------

function readIdsFromLs(key: string): FinykIdEntry[] {
  const arr = readJSON<unknown>(key, null);
  if (!Array.isArray(arr)) return [];
  const out: FinykIdEntry[] = [];
  for (const v of arr) {
    if (typeof v === "string" && v.length > 0) out.push({ id: v });
  }
  return out;
}

interface IdLike {
  id?: unknown;
}

function readBlobsFromLs(key: string): FinykBlobEntry[] {
  const arr = readJSON<unknown>(key, null);
  if (!Array.isArray(arr)) return [];
  const out: FinykBlobEntry[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const id =
      typeof (row as IdLike).id === "string" ? (row as IdLike).id : null;
    if (!id) continue;
    try {
      out.push({ id: id as string, dataJson: JSON.stringify(row) });
    } catch {
      continue;
    }
  }
  return out;
}

function readTxCatsFromLs(): FinykTxCategoryEntry[] {
  const map = readJSON<unknown>(LS_TX_CATS, null);
  if (!map || typeof map !== "object" || Array.isArray(map)) return [];
  const out: FinykTxCategoryEntry[] = [];
  for (const [transactionId, categoryId] of Object.entries(
    map as Record<string, unknown>,
  )) {
    if (typeof categoryId !== "string" || categoryId.length === 0) continue;
    if (typeof transactionId !== "string" || transactionId.length === 0)
      continue;
    out.push({ transactionId, categoryId });
  }
  return out;
}

function readTxSplitsFromLs(): FinykTxSplitsEntry[] {
  const map = readJSON<unknown>(LS_TX_SPLITS, null);
  if (!map || typeof map !== "object" || Array.isArray(map)) return [];
  const out: FinykTxSplitsEntry[] = [];
  for (const [transactionId, splits] of Object.entries(
    map as Record<string, unknown>,
  )) {
    if (!Array.isArray(splits) || splits.length === 0) continue;
    if (typeof transactionId !== "string" || transactionId.length === 0)
      continue;
    try {
      out.push({ transactionId, splitsJson: JSON.stringify(splits) });
    } catch {
      continue;
    }
  }
  return out;
}

function readMonoDebtLinksFromLs(): FinykMonoDebtLinkEntry[] {
  const map = readJSON<unknown>(LS_MONO_DEBT_LINKED, null);
  if (!map || typeof map !== "object" || Array.isArray(map)) return [];
  const out: FinykMonoDebtLinkEntry[] = [];
  for (const [transactionId, debtIds] of Object.entries(
    map as Record<string, unknown>,
  )) {
    if (!Array.isArray(debtIds) || debtIds.length === 0) continue;
    if (typeof transactionId !== "string" || transactionId.length === 0)
      continue;
    try {
      out.push({ transactionId, debtIdsJson: JSON.stringify(debtIds) });
    } catch {
      continue;
    }
  }
  return out;
}

function readNetworthFromLs(): FinykNetworthEntry[] {
  const arr = readJSON<unknown>(LS_NETWORTH_HISTORY, null);
  if (!Array.isArray(arr)) return [];
  const out: FinykNetworthEntry[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const r = row as { month?: unknown; networth?: unknown };
    const month =
      typeof r.month === "string" && /^\d{4}-\d{2}$/.test(r.month)
        ? r.month
        : null;
    const networth =
      typeof r.networth === "number" && Number.isFinite(r.networth)
        ? r.networth
        : null;
    if (!month || networth === null) continue;
    out.push({ month, networth });
  }
  return out;
}

function readPrefsFromLs(): FinykDualWriteState["prefs"] {
  const rawPlan = readJSON<unknown>(LS_MONTHLY_PLAN, null);
  let monthlyPlanJson: string;
  try {
    monthlyPlanJson = JSON.stringify(rawPlan ?? {});
  } catch {
    monthlyPlanJson = "{}";
  }

  const showBalanceRaw = readRaw(LS_SHOW_BALANCE, "1");
  const showBalance = showBalanceRaw !== "0";

  return { monthlyPlanJson, showBalance };
}

export const __testing = {
  STALE_TIMESTAMP,
  ALL_KEYS,
};

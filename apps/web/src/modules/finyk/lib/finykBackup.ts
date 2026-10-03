/**
 * Finyk backup — web storage adapter.
 *
 * Stage 8 PR #057k-tombstone: reads now prefer the SQLite cache
 * (`getCachedFinykSqliteState()`) over LS.
 *
 * AI-DANGER: запис бекапу мусить іти В SQLITE, а не лише в LS. Довгий
 * час тут стояв самий `persistFinykNormalizedToStorage` (LS), і це
 * трималось на дренажі `importFinykResidualFromLs`, який на наступному
 * boot переливав LS-ключі в SQLite. Дренаж видалено 2026-08 (див. шапку
 * `sqliteReadBoot.ts`), а разом із ним зник і єдиний місток: імпорт
 * писав у ключі, яких уже ніхто не читає, тоді як `FinykBootCluster`
 * гріє кеш на кожному маршруті, тож `readFinykBackupFromStorage`
 * завжди бачить теплу гілку — імпортоване не зʼявлялось НІКОЛИ.
 * Тому `persistFinykNormalizedToSqlite` тут обовʼязковий, і виклик
 * треба **чекати**: `HubBackupPanel` одразу після імпорту робить
 * `window.location.reload()`, який убʼє fire-and-forget запис.
 *
 * LS-запис лишається для холодного кеша (анонім до boot-у, SQLite
 * недоступний) — там `readFinykBackupFromStorage` читає саме LS.
 *
 * The pure normalize / version / payload-shape logic lives in
 * `@sergeant/finyk-domain/backup` so the mobile app can reuse it
 * without depending on localStorage.
 */

import { notifyFinykRoutineCalendarSync } from "../hubRoutineSync";
import { readJSON, writeJSON } from "./finykStorage";
import { getCachedFinykSqliteState } from "./sqliteReader";
import {
  dualWriteFinykState,
  type FinykDualWriteState,
} from "./sqliteWriter/index.js";
import type { FinykPrefsSnapshot } from "./sqliteWriter/diff.js";
import {
  blobsFromArray,
  idsFromArray,
  monoDebtLinksFromMap,
  networthHistoryFrom,
  serializePrefsJson,
  txCatsFromMap,
  txSplitsFromMap,
} from "./sqliteWriter/extract.js";
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
 */
export function readFinykBackupFromStorage() {
  const cache = getCachedFinykSqliteState();
  const warm = cache.refreshedAt !== null;

  return {
    version: FINYK_BACKUP_VERSION,
    budgets: warm
      ? cache.budgets
      : readJSON(FINYK_FIELD_TO_STORAGE_KEY.budgets, []),
    // Cold-cache default is an empty list — exporting a backup from a
    // fresh install must not bake the preset catalog into the file
    // (mirrors the `finyk_subs` default in `useFinykStorageSlots`).
    subscriptions: warm
      ? cache.subscriptions
      : readJSON(FINYK_FIELD_TO_STORAGE_KEY.subscriptions, []),
    manualExpenses: warm
      ? cache.manualExpenses
      : readJSON(FINYK_FIELD_TO_STORAGE_KEY.manualExpenses, []),
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
    excludedStatTxIds:
      warm && cache.excludedStatTxIds !== null
        ? cache.excludedStatTxIds
        : readJSON(FINYK_FIELD_TO_STORAGE_KEY.excludedStatTxIds, []),
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
    dismissedRecurring:
      warm && cache.dismissedRecurring !== null
        ? cache.dismissedRecurring
        : readJSON(FINYK_FIELD_TO_STORAGE_KEY.dismissedRecurring, []),
    // Правила «Завжди так» живуть лише в SQLite (`prefs_json`), LS-ключа
    // нема: холодний кеш → порожньо, як і для решти prefs без LS-дубля.
    merchantRules:
      warm && cache.merchantRules !== null ? cache.merchantRules : [],
  };
}

/**
 * Writes a normalised Finyk backup to localStorage. Kept for the
 * cold-cache read path only (`readFinykBackupFromStorage` falls back
 * to LS before the SQLite boot warms the cache). The canonical write
 * is {@link persistFinykNormalizedToSqlite} — see the AI-DANGER note
 * at the top of the file.
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

/**
 * Canonical import write: mirrors a normalised backup into the Finyk
 * SQLite tables, which is what every Finyk read path actually looks at.
 *
 * Replace, not merge. `HubBackupPanel` asks the user to confirm
 * «Імпорт повністю замінить ці дані на цьому пристрої», so the diff
 * runs against the CURRENT warm cache: rows the backup no longer
 * carries are tombstoned instead of surviving as a silent union.
 * Slices the file omits are copied over from `prev` untouched, which
 * mirrors `persistFinykNormalizedToStorage` skipping absent fields.
 *
 * Awaitable on purpose — the caller reloads the page right after.
 * Never rejects: `dualWriteFinykState` reports failures through
 * dual-write telemetry and returns a `skipped` outcome when no
 * context is registered (anonymous / pre-boot).
 */
export async function persistFinykNormalizedToSqlite(
  normalized: FinykBackup,
): Promise<void> {
  const prev = cacheToDualWriteState();
  await dualWriteFinykState(prev, backupOntoState(prev, normalized));
}

function cacheToDualWriteState(): FinykDualWriteState {
  const cache = getCachedFinykSqliteState();
  return {
    hiddenAccounts: idsFromArray(cache.hiddenAccounts),
    hiddenTransactions: idsFromArray(cache.hiddenTransactions),
    budgets: blobsFromArray(cache.budgets),
    subscriptions: blobsFromArray(cache.subscriptions),
    assets: blobsFromArray(cache.manualAssets),
    debts: blobsFromArray(cache.manualDebts),
    receivables: blobsFromArray(cache.receivables),
    customCategories: blobsFromArray(cache.customCategories),
    manualExpenses: blobsFromArray(cache.manualExpenses),
    txCategories: txCatsFromMap(cache.txCategories),
    txSplits: txSplitsFromMap(cache.txSplits),
    monoDebtLinks: monoDebtLinksFromMap(cache.monoDebtLinkedTxIds),
    networthHistory: networthHistoryFrom(cache.networthHistory),
    prefs: {
      monthlyPlanJson: toJson(cache.monthlyPlan ?? {}, "{}"),
      showBalance: cache.showBalance ?? true,
      excludedStatTxIdsJson: toJson(cache.excludedStatTxIds ?? [], "[]"),
      dismissedRecurringJson: toJson(cache.dismissedRecurring ?? [], "[]"),
      prefsJson: serializePrefsJson(cache.merchantRules),
    },
  };
}

function backupOntoState(
  prev: FinykDualWriteState,
  b: FinykBackup,
): FinykDualWriteState {
  const next: {
    -readonly [K in keyof FinykDualWriteState]: FinykDualWriteState[K];
  } = { ...prev };
  if (b.hiddenAccounts) next.hiddenAccounts = idsFromArray(b.hiddenAccounts);
  if (b.hiddenTxIds) next.hiddenTransactions = idsFromArray(b.hiddenTxIds);
  if (b.budgets) next.budgets = blobsFromArray(b.budgets);
  if (b.subscriptions) next.subscriptions = blobsFromArray(b.subscriptions);
  if (b.manualAssets) next.assets = blobsFromArray(b.manualAssets);
  if (b.manualDebts) next.debts = blobsFromArray(b.manualDebts);
  if (b.receivables) next.receivables = blobsFromArray(b.receivables);
  if (b.customCategories) {
    next.customCategories = blobsFromArray(b.customCategories);
  }
  if (b.manualExpenses) next.manualExpenses = blobsFromArray(b.manualExpenses);
  if (b.txCategories) next.txCategories = txCatsFromMap(b.txCategories);
  if (b.txSplits) next.txSplits = txSplitsFromMap(b.txSplits);
  if (b.monoDebtLinkedTxIds) {
    next.monoDebtLinks = monoDebtLinksFromMap(b.monoDebtLinkedTxIds);
  }
  if (b.networthHistory) {
    next.networthHistory = networthHistoryFrom(b.networthHistory);
  }
  next.prefs = prefsOntoSnapshot(prev.prefs, b);
  return next;
}

/**
 * `showBalance` навмисно береться з `prev`: конверт бекапу його не
 * везе, а дефолт `true` затер би вимкнений баланс на пристрої.
 */
function prefsOntoSnapshot(
  prev: FinykPrefsSnapshot | null,
  b: FinykBackup,
): FinykPrefsSnapshot {
  const base: FinykPrefsSnapshot = prev ?? {
    monthlyPlanJson: "{}",
    showBalance: true,
    excludedStatTxIdsJson: "[]",
    dismissedRecurringJson: "[]",
    prefsJson: "{}",
  };
  return {
    showBalance: base.showBalance,
    monthlyPlanJson: b.monthlyPlan
      ? toJson(b.monthlyPlan, "{}")
      : base.monthlyPlanJson,
    excludedStatTxIdsJson: b.excludedStatTxIds
      ? toJson(onlyStrings(b.excludedStatTxIds), "[]")
      : base.excludedStatTxIdsJson,
    dismissedRecurringJson: b.dismissedRecurring
      ? toJson(onlyStrings(b.dismissedRecurring), "[]")
      : base.dismissedRecurringJson,
    // Файл без правил (старий бекап) лишає наявні: «Замінити» діє на
    // зріз лише тоді, коли файл його несе — як і для решти полів.
    prefsJson: b.merchantRules
      ? serializePrefsJson(b.merchantRules)
      : base.prefsJson,
  };
}

function onlyStrings(value: readonly unknown[]): string[] {
  return value.filter((v): v is string => typeof v === "string" && v !== "");
}

function toJson(value: unknown, fallback: string): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

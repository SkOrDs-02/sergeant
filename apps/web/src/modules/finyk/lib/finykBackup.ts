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
 * `window.location.reload()`, який убʼє fire-and-forget запис. Запис іде
 * журнальованим шляхом (`dualWriteFinykState`), а панель перед reload ще
 * чекає `outboxCheckpoint()` (аудит 2026-10-01, data-07).
 *
 * LS-запис лишається для холодного кеша (анонім до boot-у, SQLite
 * недоступний) — там `readFinykBackupFromStorage` читає саме LS.
 *
 * The pure normalize / version / payload-shape logic lives in
 * `@sergeant/finyk-domain/backup` so the mobile app can reuse it
 * without depending on localStorage.
 */

import type { DualWriteOutcome } from "@sergeant/dualwrite-core";
import {
  addMissingBy,
  BACKUP_RESTORE_NOT_READY_MESSAGE,
  type BackupRestoreMode,
} from "@shared/lib/backup/restoreMode";
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
 * Два режими (аудит 2026-10-01, data-06), див. `BackupRestoreMode`:
 *
 *  - `merge`: лише додати відсутнє. Рядок із тим самим id лишається таким,
 *    яким був на пристрої, рядки, яких файл не несе, не чіпаються: diff
 *    не містить жодного `delete`, а отже на сервер не їде жоден tombstone.
 *  - `replace`: diff іде проти ПОТОЧНОГО теплого кеша, і рядки, яких у файлі
 *    немає, гасяться. Це видалення їде на сервер і на всі пристрої акаунта,
 *    тому режим лише явний (діалог у `HubBackupPanel`).
 *
 * Обидва режими потребують ТЕПЛОГО кеша: diff від холодного (порожнього)
 * кеша не бачить рядків акаунта, тож «заміна» мовчки вироджується в злиття, а
 * `merge` перезаписав би існуючі рядки. Панель блокує імпорт, доки кеш не
 * прогрітий, а тут це ще й перевіряється.
 *
 * Slices the file omits are copied over from `prev` untouched, which
 * mirrors `persistFinykNormalizedToStorage` skipping absent fields.
 *
 * Awaitable on purpose — the caller reloads the page right after.
 * Resolves with the `DualWriteOutcome`: `skipped` (no context, sqlite
 * unavailable) is NOT an error here but the caller MUST NOT treat it as a
 * successful restore (`applyHubBackupPayload` throws on it). На холодному
 * кеші кидає, а не повертає `skipped`: це не стан запису, а відмова почати.
 */
export async function persistFinykNormalizedToSqlite(
  normalized: FinykBackup,
  mode: BackupRestoreMode,
): Promise<DualWriteOutcome> {
  if (getCachedFinykSqliteState().refreshedAt === null) {
    throw new Error(BACKUP_RESTORE_NOT_READY_MESSAGE);
  }
  const prev = cacheToDualWriteState();
  const next =
    mode === "replace"
      ? backupOntoState(prev, normalized)
      : mergeBackupOntoState(prev, normalized);
  return dualWriteFinykState(prev, next);
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
 * Режим `merge`: те саме, що {@link backupOntoState}, але кожен зріз =
 * поточні рядки + рядки файлу з новим ключем. Скалярні налаштування (план
 * місяця, правила мерчантів) файл ставить лише там, де на пристрої порожньо;
 * списки id (виключені з статистики, відхилені рекурентні) обʼєднуються.
 */
function mergeBackupOntoState(
  prev: FinykDualWriteState,
  b: FinykBackup,
): FinykDualWriteState {
  const byId = (e: { readonly id: string }) => e.id;
  const byTx = (e: { readonly transactionId: string }) => e.transactionId;
  const next: {
    -readonly [K in keyof FinykDualWriteState]: FinykDualWriteState[K];
  } = { ...prev };
  if (b.hiddenAccounts) {
    next.hiddenAccounts = addMissingBy(
      prev.hiddenAccounts,
      idsFromArray(b.hiddenAccounts),
      byId,
    );
  }
  if (b.hiddenTxIds) {
    next.hiddenTransactions = addMissingBy(
      prev.hiddenTransactions,
      idsFromArray(b.hiddenTxIds),
      byId,
    );
  }
  if (b.budgets) {
    next.budgets = addMissingBy(prev.budgets, blobsFromArray(b.budgets), byId);
  }
  if (b.subscriptions) {
    next.subscriptions = addMissingBy(
      prev.subscriptions,
      blobsFromArray(b.subscriptions),
      byId,
    );
  }
  if (b.manualAssets) {
    next.assets = addMissingBy(
      prev.assets,
      blobsFromArray(b.manualAssets),
      byId,
    );
  }
  if (b.manualDebts) {
    next.debts = addMissingBy(prev.debts, blobsFromArray(b.manualDebts), byId);
  }
  if (b.receivables) {
    next.receivables = addMissingBy(
      prev.receivables,
      blobsFromArray(b.receivables),
      byId,
    );
  }
  if (b.customCategories) {
    next.customCategories = addMissingBy(
      prev.customCategories,
      blobsFromArray(b.customCategories),
      byId,
    );
  }
  if (b.manualExpenses) {
    next.manualExpenses = addMissingBy(
      prev.manualExpenses,
      blobsFromArray(b.manualExpenses),
      byId,
    );
  }
  if (b.txCategories) {
    next.txCategories = addMissingBy(
      prev.txCategories,
      txCatsFromMap(b.txCategories),
      byTx,
    );
  }
  if (b.txSplits) {
    next.txSplits = addMissingBy(
      prev.txSplits,
      txSplitsFromMap(b.txSplits),
      byTx,
    );
  }
  if (b.monoDebtLinkedTxIds) {
    next.monoDebtLinks = addMissingBy(
      prev.monoDebtLinks,
      monoDebtLinksFromMap(b.monoDebtLinkedTxIds),
      byTx,
    );
  }
  if (b.networthHistory) {
    next.networthHistory = addMissingBy(
      prev.networthHistory,
      networthHistoryFrom(b.networthHistory),
      (e) => e.month,
    );
  }
  next.prefs = mergePrefs(prev.prefs, b);
  return next;
}

function isEmptyJson(raw: string): boolean {
  return raw === "" || raw === "{}" || raw === "[]" || raw === "null";
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? onlyStrings(parsed) : [];
  } catch {
    return [];
  }
}

function mergePrefs(
  prev: FinykPrefsSnapshot | null,
  b: FinykBackup,
): FinykPrefsSnapshot {
  const fromFile = prefsOntoSnapshot(prev, b);
  const cur = prev ?? EMPTY_PREFS;
  const unionIds = (
    curRaw: string,
    incoming: readonly unknown[] | undefined,
  ) =>
    incoming
      ? toJson(
          addMissingBy(
            parseStringArray(curRaw),
            onlyStrings(incoming),
            (v) => v,
          ),
          "[]",
        )
      : curRaw;
  const hasRules = (getCachedFinykSqliteState().merchantRules ?? []).length > 0;
  return {
    showBalance: cur.showBalance,
    monthlyPlanJson: isEmptyJson(cur.monthlyPlanJson)
      ? fromFile.monthlyPlanJson
      : cur.monthlyPlanJson,
    excludedStatTxIdsJson: unionIds(
      cur.excludedStatTxIdsJson,
      b.excludedStatTxIds,
    ),
    dismissedRecurringJson: unionIds(
      cur.dismissedRecurringJson,
      b.dismissedRecurring,
    ),
    prefsJson: hasRules ? cur.prefsJson : fromFile.prefsJson,
  };
}

const EMPTY_PREFS: FinykPrefsSnapshot = {
  monthlyPlanJson: "{}",
  showBalance: true,
  excludedStatTxIdsJson: "[]",
  dismissedRecurringJson: "[]",
  prefsJson: "{}",
};

/**
 * `showBalance` навмисно береться з `prev`: конверт бекапу його не
 * везе, а дефолт `true` затер би вимкнений баланс на пристрої.
 */
function prefsOntoSnapshot(
  prev: FinykPrefsSnapshot | null,
  b: FinykBackup,
): FinykPrefsSnapshot {
  const base: FinykPrefsSnapshot = prev ?? EMPTY_PREFS;
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

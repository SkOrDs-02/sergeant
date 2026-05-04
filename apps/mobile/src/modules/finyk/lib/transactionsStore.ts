/**
 * MMKV-backed Transactions store for Finyk (mobile).
 *
 * Owns the slices the `TransactionsPage` reads / writes:
 *   - manualExpenses     → finyk_manual_expenses_v1  (FINYK_STORAGE_KEYS.transactions)
 *   - txCategories       → finyk_tx_cats             (FINYK_BACKUP_STORAGE_KEYS.txCategories)
 *   - txSplits           → finyk_tx_splits           (FINYK_BACKUP_STORAGE_KEYS.txSplits)
 *   - hiddenTxIds        → finyk_hidden_txs          (FINYK_BACKUP_STORAGE_KEYS.hiddenTxIds)
 *
 * Each setter persists to MMKV via `safeWriteLS` and then calls
 * `enqueueChange(KEY)` so the cloud-sync scheduler picks the change
 * up — same pattern as `assetsStore.ts`.
 *
 * Real Monobank-sourced transactions (`realTx`) are written to MMKV by
 * the network layer (web `useMonobank` snapshot, mirrored across devices
 * by cloud sync) under `FINYK_TX_CACHE` (current snapshot) and
 * `FINYK_TX_CACHE_LAST_GOOD` (last non-empty fallback). We hydrate
 * `realTx` from those keys on mount and on `refresh()`. Tests / storybook
 * can still pass a `seed.realTx` to bypass MMKV entirely.
 */
import { useCallback, useEffect, useState } from "react";

import {
  FINYK_BACKUP_STORAGE_KEYS,
  FINYK_STORAGE_KEYS,
} from "@sergeant/finyk-domain";
import type { MonoAccount, Transaction } from "@sergeant/finyk-domain/domain";
import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance, safeReadLS, safeWriteLS } from "@/lib/storage";
import { isFinykDualWriteRegistered, triggerFinykDualWrite } from "./dualWrite";
import {
  blobsFromArray,
  idsFromArray,
  stateWithSlice,
  txCatsFromMap,
  txSplitsFromMap,
} from "./dualWrite/extract";
import { enqueueChange } from "@/sync/enqueue";

import type { ManualExpensePayload } from "../components/ManualExpenseSheet";

import { getCachedFinykSqliteState } from "./sqliteReader";
import { useFinykSqliteReadGate } from "./sqliteReadGate";

const KEY_MANUAL = FINYK_STORAGE_KEYS.transactions;
const KEY_TX_CATS = FINYK_BACKUP_STORAGE_KEYS.txCategories;
const KEY_TX_SPLITS = FINYK_BACKUP_STORAGE_KEYS.txSplits;
const KEY_HIDDEN_TXS = FINYK_BACKUP_STORAGE_KEYS.hiddenTxIds;
const KEY_FILTERS = STORAGE_KEYS.FINYK_TX_FILTERS;
const KEY_TX_CACHE = STORAGE_KEYS.FINYK_TX_CACHE;
const KEY_TX_CACHE_LAST_GOOD = STORAGE_KEYS.FINYK_TX_CACHE_LAST_GOOD;

/**
 * Snapshot shape mirrored from the web `useMonobank` hook
 * (`apps/web/src/modules/finyk/hooks/useMonobank.ts`). Cloud-sync mirrors
 * these blobs across devices so the mobile screen can render the latest
 * imported bank statement without a live network round-trip.
 */
interface TxCacheSnapshot {
  txs: Transaction[];
  timestamp: number;
}

/**
 * Read the cached bank-statement snapshot, falling back to the
 * `last_good` blob when the primary cache is empty (matches web parity).
 */
function readBankTxCache(): Transaction[] {
  const primary = safeReadLS<TxCacheSnapshot | null>(KEY_TX_CACHE, null);
  if (primary && Array.isArray(primary.txs) && primary.txs.length > 0) {
    return primary.txs;
  }
  const fallback = safeReadLS<TxCacheSnapshot | null>(
    KEY_TX_CACHE_LAST_GOOD,
    null,
  );
  if (fallback && Array.isArray(fallback.txs) && fallback.txs.length > 0) {
    return fallback.txs;
  }
  return [];
}

/**
 * Persisted shape of a manual expense entry — matches the web file
 * (`apps/web/src/modules/finyk/hooks/useStorage.ts`). `id` is a stable
 * client-generated string; `amount` is in UAH (positive number).
 */
export interface ManualExpenseRecord {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
}

export interface TxSplitEntry {
  categoryId: string;
  amount: number;
}

function read<T>(key: string, fallback: T): T {
  const v = safeReadLS<T>(key, fallback);
  return v == null ? fallback : v;
}

export interface FinykTransactionsSeed {
  manualExpenses?: ManualExpenseRecord[];
  txCategories?: Record<string, string>;
  txSplits?: Record<string, TxSplitEntry[]>;
  hiddenTxIds?: string[];
  /** Real (Monobank-sourced) transactions — not persisted, render-only. */
  realTx?: Transaction[];
  /** Mono accounts — used for the "credit card" filter. */
  accounts?: MonoAccount[];
  /** Custom categories — surfaced in the category filter chips. */
  customCategories?: { id: string; label: string }[];
}

export interface UseFinykTransactionsStoreReturn {
  manualExpenses: ManualExpenseRecord[];
  txCategories: Record<string, string>;
  txSplits: Record<string, TxSplitEntry[]>;
  hiddenTxIds: string[];
  realTx: Transaction[];
  accounts: MonoAccount[];
  customCategories: { id: string; label: string }[];

  addManualExpense: (entry: ManualExpensePayload) => ManualExpenseRecord;
  updateManualExpense: (id: string, patch: ManualExpensePayload) => void;
  removeManualExpense: (id: string) => void;
  hideTx: (id: string) => void;
  unhideTx: (id: string) => void;
  overrideCategory: (txId: string, categoryId: string | null) => void;
  setSplitTx: (txId: string, splits: TxSplitEntry[]) => void;
  /** Re-read every persisted slice from MMKV. Used by pull-to-refresh. */
  refresh: () => void;
}

/**
 * Persisted filter state — survives navigation away from the screen,
 * re-mounting, and app cold-starts. Wired to its own MMKV key so it
 * round-trips through CloudSync when the user opts in.
 */
export interface FinykTxFilterState {
  /** Quick filter id (`all` / `expense` / `income` / `credit` / category id). */
  filter: string;
  /** Optional account id whitelist. Empty = no account filter. */
  accountIds: string[];
  /** Optional millis-since-epoch range. `null` = month nav defines the window. */
  range: { startMs: number | null; endMs: number | null };
}

const DEFAULT_FILTERS: FinykTxFilterState = {
  filter: "all",
  accountIds: [],
  range: { startMs: null, endMs: null },
};

export function useFinykTxFilters(seed?: Partial<FinykTxFilterState>): {
  filters: FinykTxFilterState;
  setFilter: (filter: string) => void;
  setAccountIds: (ids: string[]) => void;
  setRange: (range: FinykTxFilterState["range"]) => void;
  clearAll: () => void;
} {
  const [filters, setFiltersState] = useState<FinykTxFilterState>(() => {
    const stored = read<FinykTxFilterState>(KEY_FILTERS, DEFAULT_FILTERS);
    return { ...DEFAULT_FILTERS, ...stored, ...(seed ?? {}) };
  });

  const persist = useCallback((next: FinykTxFilterState) => {
    setFiltersState(next);
    safeWriteLS(KEY_FILTERS, next);
    enqueueChange(KEY_FILTERS);
  }, []);

  const setFilter = useCallback(
    (filter: string) => {
      persist({
        ...read<FinykTxFilterState>(KEY_FILTERS, DEFAULT_FILTERS),
        filter,
      });
    },
    [persist],
  );

  const setAccountIds = useCallback(
    (accountIds: string[]) => {
      persist({
        ...read<FinykTxFilterState>(KEY_FILTERS, DEFAULT_FILTERS),
        accountIds,
      });
    },
    [persist],
  );

  const setRange = useCallback(
    (range: FinykTxFilterState["range"]) => {
      persist({
        ...read<FinykTxFilterState>(KEY_FILTERS, DEFAULT_FILTERS),
        range,
      });
    },
    [persist],
  );

  const clearAll = useCallback(() => {
    persist(DEFAULT_FILTERS);
  }, [persist]);

  return { filters, setFilter, setAccountIds, setRange, clearAll };
}

function genId(): string {
  return `me_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Read-through MMKV hook for the Transactions page slices. Mirrors the
 * `useFinykAssetsStore` shape exactly so future consolidation into a
 * single Finyk root store is mechanical.
 */
export function useFinykTransactionsStore(
  seed?: FinykTransactionsSeed,
): UseFinykTransactionsStoreReturn {
  const [manualExpenses, setManualState] = useState<ManualExpenseRecord[]>(
    () => seed?.manualExpenses ?? read<ManualExpenseRecord[]>(KEY_MANUAL, []),
  );
  const [txCategories, setTxCatsState] = useState<Record<string, string>>(
    () => seed?.txCategories ?? read<Record<string, string>>(KEY_TX_CATS, {}),
  );
  const [txSplits, setTxSplitsState] = useState<Record<string, TxSplitEntry[]>>(
    () =>
      seed?.txSplits ?? read<Record<string, TxSplitEntry[]>>(KEY_TX_SPLITS, {}),
  );
  const [hiddenTxIds, setHiddenState] = useState<string[]>(
    () => seed?.hiddenTxIds ?? read<string[]>(KEY_HIDDEN_TXS, []),
  );
  const [realTx, setRealTxState] = useState<Transaction[]>(
    () => seed?.realTx ?? readBankTxCache(),
  );

  // Flush seed values through MMKV on first mount so re-renders read
  // through the same code path as production.
  useEffect(() => {
    if (!seed) return;
    if (seed.manualExpenses) safeWriteLS(KEY_MANUAL, seed.manualExpenses);
    if (seed.txCategories) safeWriteLS(KEY_TX_CATS, seed.txCategories);
    if (seed.txSplits) safeWriteLS(KEY_TX_SPLITS, seed.txSplits);
    if (seed.hiddenTxIds) safeWriteLS(KEY_HIDDEN_TXS, seed.hiddenTxIds);
    if (seed.realTx) {
      const snapshot: TxCacheSnapshot = {
        txs: seed.realTx,
        timestamp: Date.now(),
      };
      safeWriteLS(KEY_TX_CACHE, snapshot);
    }
    // Mount-only: `seed` is expected to be stable (from parent context).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick up writes from other consumers of the same keys (e.g.
  // CloudSync pulling a fresh server payload).
  useEffect(() => {
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((changedKey) => {
      switch (changedKey) {
        case KEY_MANUAL:
          setManualState(read<ManualExpenseRecord[]>(KEY_MANUAL, []));
          break;
        case KEY_TX_CATS:
          setTxCatsState(read<Record<string, string>>(KEY_TX_CATS, {}));
          break;
        case KEY_TX_SPLITS:
          setTxSplitsState(
            read<Record<string, TxSplitEntry[]>>(KEY_TX_SPLITS, {}),
          );
          break;
        case KEY_HIDDEN_TXS:
          setHiddenState(read<string[]>(KEY_HIDDEN_TXS, []));
          break;
        case KEY_TX_CACHE:
        case KEY_TX_CACHE_LAST_GOOD:
          setRealTxState(readBankTxCache());
          break;
        default:
          break;
      }
    });
    return () => sub.remove();
  }, []);

  // Stage 4 PR #037 — under `feature.finyk.sqlite_v2.read_sqlite`,
  // overlay every persisted slice from the local SQLite cache once
  // it's warm. The MMKV first-paint reads above stay as a synchronous
  // fallback; this effect only fires after `useFinykSqliteReadBoot`
  // has refreshed the cache, so the overlay is no-op for cold starts
  // with the flag off.
  const { enabled: sqliteReadEnabled, tick: sqliteCacheTick } =
    useFinykSqliteReadGate();
  useEffect(() => {
    if (!sqliteReadEnabled) return;
    const cache = getCachedFinykSqliteState();
    if (cache.refreshedAt === null) return;
    // The cache's `ManualExpense` shape mirrors `ManualExpenseRecord`
    // exactly (kept in sync inside `sqliteReader.ts` to avoid a
    // circular import); the assignment is a structural pass-through.
    setManualState(cache.manualExpenses);
    // `TxCategoriesMap` declares `string | undefined` values; the
    // `_State` setter takes `Record<string, string>`. Sweep
    // `undefined`-valued entries (cache rows always carry a defined
    // `category_id` so this is defensive only).
    const txCats: Record<string, string> = {};
    for (const [k, v] of Object.entries(cache.txCategories)) {
      if (typeof v === "string") txCats[k] = v;
    }
    setTxCatsState(txCats);
    // `TxSplitsMap` declares `TxSplit[] | undefined`; the
    // `_State` setter takes `Record<string, TxSplitEntry[]>`. Same
    // sweep — drop `undefined`-valued buckets.
    const txSplitsMap: Record<string, TxSplitEntry[]> = {};
    for (const [k, v] of Object.entries(cache.txSplits)) {
      if (Array.isArray(v)) txSplitsMap[k] = v;
    }
    setTxSplitsState(txSplitsMap);
    setHiddenState(cache.hiddenTransactions);
  }, [sqliteReadEnabled, sqliteCacheTick]);

  const writeManual = useCallback((next: ManualExpenseRecord[]) => {
    const prev = read<ManualExpenseRecord[]>(KEY_MANUAL, []);
    setManualState(next);
    safeWriteLS(KEY_MANUAL, next);
    enqueueChange(KEY_MANUAL);
    if (isFinykDualWriteRegistered()) {
      triggerFinykDualWrite(
        stateWithSlice("manualExpenses", blobsFromArray(prev)),
        stateWithSlice("manualExpenses", blobsFromArray(next)),
      );
    }
  }, []);

  const addManualExpense = useCallback(
    (entry: ManualExpensePayload): ManualExpenseRecord => {
      const id = entry.id ?? genId();
      const record: ManualExpenseRecord = {
        id,
        date: entry.date,
        description: entry.description,
        amount: entry.amount,
        category: entry.category,
      };
      // Reuse the latest persisted snapshot so back-to-back adds don't
      // race the React state setter.
      const current = read<ManualExpenseRecord[]>(KEY_MANUAL, []);
      writeManual([record, ...current.filter((e) => e.id !== id)]);
      return record;
    },
    [writeManual],
  );

  const updateManualExpense = useCallback(
    (id: string, patch: ManualExpensePayload) => {
      const current = read<ManualExpenseRecord[]>(KEY_MANUAL, []);
      const next = current.map((e) =>
        e.id === id
          ? {
              id,
              date: patch.date,
              description: patch.description,
              amount: patch.amount,
              category: patch.category,
            }
          : e,
      );
      writeManual(next);
    },
    [writeManual],
  );

  const removeManualExpense = useCallback(
    (id: string) => {
      const current = read<ManualExpenseRecord[]>(KEY_MANUAL, []);
      writeManual(current.filter((e) => e.id !== id));
    },
    [writeManual],
  );

  const hideTx = useCallback((id: string) => {
    const current = read<string[]>(KEY_HIDDEN_TXS, []);
    if (current.includes(id)) return;
    const next = [...current, id];
    setHiddenState(next);
    safeWriteLS(KEY_HIDDEN_TXS, next);
    enqueueChange(KEY_HIDDEN_TXS);
    if (isFinykDualWriteRegistered()) {
      triggerFinykDualWrite(
        stateWithSlice("hiddenTransactions", idsFromArray(current)),
        stateWithSlice("hiddenTransactions", idsFromArray(next)),
      );
    }
  }, []);

  const unhideTx = useCallback((id: string) => {
    const current = read<string[]>(KEY_HIDDEN_TXS, []);
    if (!current.includes(id)) return;
    const next = current.filter((x) => x !== id);
    setHiddenState(next);
    safeWriteLS(KEY_HIDDEN_TXS, next);
    enqueueChange(KEY_HIDDEN_TXS);
    if (isFinykDualWriteRegistered()) {
      triggerFinykDualWrite(
        stateWithSlice("hiddenTransactions", idsFromArray(current)),
        stateWithSlice("hiddenTransactions", idsFromArray(next)),
      );
    }
  }, []);

  const overrideCategory = useCallback(
    (txId: string, categoryId: string | null) => {
      const current = read<Record<string, string>>(KEY_TX_CATS, {});
      const next = { ...current };
      if (categoryId == null || categoryId === "") {
        delete next[txId];
      } else {
        next[txId] = categoryId;
      }
      setTxCatsState(next);
      safeWriteLS(KEY_TX_CATS, next);
      enqueueChange(KEY_TX_CATS);
      if (isFinykDualWriteRegistered()) {
        triggerFinykDualWrite(
          stateWithSlice("txCategories", txCatsFromMap(current)),
          stateWithSlice("txCategories", txCatsFromMap(next)),
        );
      }
    },
    [],
  );

  const setSplitTx = useCallback((txId: string, splits: TxSplitEntry[]) => {
    const current = read<Record<string, TxSplitEntry[]>>(KEY_TX_SPLITS, {});
    const next = { ...current };
    if (!splits || splits.length === 0) {
      delete next[txId];
    } else {
      next[txId] = splits;
    }
    setTxSplitsState(next);
    safeWriteLS(KEY_TX_SPLITS, next);
    enqueueChange(KEY_TX_SPLITS);
    if (isFinykDualWriteRegistered()) {
      triggerFinykDualWrite(
        stateWithSlice("txSplits", txSplitsFromMap(current)),
        stateWithSlice("txSplits", txSplitsFromMap(next)),
      );
    }
  }, []);

  const refresh = useCallback(() => {
    setManualState(read<ManualExpenseRecord[]>(KEY_MANUAL, []));
    setTxCatsState(read<Record<string, string>>(KEY_TX_CATS, {}));
    setTxSplitsState(read<Record<string, TxSplitEntry[]>>(KEY_TX_SPLITS, {}));
    setHiddenState(read<string[]>(KEY_HIDDEN_TXS, []));
    setRealTxState(readBankTxCache());
  }, []);

  return {
    manualExpenses,
    txCategories,
    txSplits,
    hiddenTxIds,
    realTx,
    accounts: seed?.accounts ?? [],
    customCategories: seed?.customCategories ?? [],

    addManualExpense,
    updateManualExpense,
    removeManualExpense,
    hideTx,
    unhideTx,
    overrideCategory,
    setSplitTx,
    refresh,
  };
}

import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { DEFAULT_SUBSCRIPTIONS } from "../constants";
import { readJSON, finykStorageManager } from "../lib/finykStorage";
import { useReadonlyPersist, reportSilentError } from "./useStorage.persist";
import { getCachedFinykSqliteState } from "../lib/sqliteReader";
import { useFinykSqliteReadTick } from "../lib/sqliteReadGate";
import type {
  Subscription,
  Budget,
  ManualAsset,
  ManualExpense,
  CustomCategory,
  TxCategoriesMap,
  MonoDebtLinkedMap,
  MonthlyPlan,
  NetworthEntry,
  NetworthSnap,
  Debt,
  Receivable,
  TxSplitsMap,
} from "./useStorage.types";

try {
  finykStorageManager.runAll();
} catch (error) {
  reportSilentError("storage migrations", error);
}

const defaultMonthlyPlan: MonthlyPlan = {
  income: "",
  expense: "",
  savings: "",
};

export interface FinykStorageSlots {
  hiddenAccounts: string[];
  setHiddenAccounts: Dispatch<SetStateAction<string[]>>;
  budgets: Budget[];
  setBudgets: Dispatch<SetStateAction<Budget[]>>;
  subscriptions: Subscription[];
  setSubscriptions: Dispatch<SetStateAction<Subscription[]>>;
  manualAssets: ManualAsset[];
  setManualAssets: Dispatch<SetStateAction<ManualAsset[]>>;
  manualDebts: Debt[];
  setManualDebts: Dispatch<SetStateAction<Debt[]>>;
  receivables: Receivable[];
  setReceivables: Dispatch<SetStateAction<Receivable[]>>;
  hiddenTxIds: string[];
  setHiddenTxIds: Dispatch<SetStateAction<string[]>>;
  monthlyPlan: MonthlyPlan;
  setMonthlyPlan: Dispatch<SetStateAction<MonthlyPlan>>;
  txCategories: TxCategoriesMap;
  setTxCategories: Dispatch<SetStateAction<TxCategoriesMap>>;
  monoDebtLinkedTxIds: MonoDebtLinkedMap;
  setMonoDebtLinkedTxIds: Dispatch<SetStateAction<MonoDebtLinkedMap>>;
  networthHistory: NetworthEntry[];
  setNetworthHistory: Dispatch<SetStateAction<NetworthEntry[]>>;
  txSplits: TxSplitsMap;
  setTxSplits: Dispatch<SetStateAction<TxSplitsMap>>;
  customCategories: CustomCategory[];
  setCustomCategories: Dispatch<SetStateAction<CustomCategory[]>>;
  manualExpenses: ManualExpense[];
  setManualExpenses: Dispatch<SetStateAction<ManualExpense[]>>;
  excludedStatTxIds: string[];
  setExcludedStatTxIds: Dispatch<SetStateAction<string[]>>;
  dismissedRecurring: string[];
  setDismissedRecurring: Dispatch<SetStateAction<string[]>>;
  networthSnapshotRef: React.MutableRefObject<NetworthSnap>;
}

/**
 * Reader hook: registers all Finyk persisted slots.
 *
 * Stage 8 PR #057k-tombstone + Stage 13 PR #075: усі dual-write-covered
 * слоти (14 + 2 нових) використовують `useReadonlyPersist` (LS-read
 * для first-paint, без LS-write). SQLite-overlay вкочує канонічні
 * значення коли кеш warm. Мутації persist виключно через
 * `useFinykDualWriteSync`. PR #075 додав `excludedStatTxIds` /
 * `dismissedRecurring` у `finyk_prefs` як cross-device prefs slice.
 */
export function useFinykStorageSlots(): FinykStorageSlots {
  const [hiddenAccounts, setHiddenAccounts] = useReadonlyPersist<string[]>(
    "finyk_hidden",
    [],
  );
  const [budgets, setBudgets] = useReadonlyPersist<Budget[]>(
    "finyk_budgets",
    [],
  );
  const [subscriptions, setSubscriptions] = useReadonlyPersist<Subscription[]>(
    "finyk_subs",
    DEFAULT_SUBSCRIPTIONS as Subscription[],
  );
  const [manualAssets, setManualAssets] = useReadonlyPersist<ManualAsset[]>(
    "finyk_assets",
    [],
  );
  const [manualDebts, setManualDebts] = useReadonlyPersist<Debt[]>(
    "finyk_debts",
    [],
  );
  const [receivables, setReceivables] = useReadonlyPersist<Receivable[]>(
    "finyk_recv",
    [],
  );
  const [hiddenTxIds, setHiddenTxIds] = useReadonlyPersist<string[]>(
    "finyk_hidden_txs",
    [],
  );
  const [monthlyPlan, setMonthlyPlan] = useReadonlyPersist<MonthlyPlan>(
    "finyk_monthly_plan",
    defaultMonthlyPlan,
  );
  const [txCategories, setTxCategories] = useReadonlyPersist<TxCategoriesMap>(
    "finyk_tx_cats",
    {},
  );
  const [monoDebtLinkedTxIds, setMonoDebtLinkedTxIds] =
    useReadonlyPersist<MonoDebtLinkedMap>("finyk_mono_debt_linked", {});
  const [networthHistory, setNetworthHistory] = useReadonlyPersist<
    NetworthEntry[]
  >("finyk_networth_history", []);
  const [txSplits, setTxSplits] = useReadonlyPersist<TxSplitsMap>(
    "finyk_tx_splits",
    {},
  );
  const [customCategories, setCustomCategories] = useReadonlyPersist<
    CustomCategory[]
  >("finyk_custom_cats_v1", []);
  const [manualExpenses, setManualExpenses] = useReadonlyPersist<
    ManualExpense[]
  >("finyk_manual_expenses_v1", []);
  const [excludedStatTxIds, setExcludedStatTxIds] = useReadonlyPersist<
    string[]
  >("finyk_excluded_stat_txs", []);
  const [dismissedRecurring, setDismissedRecurring] = useReadonlyPersist<
    string[]
  >("finyk_rec_dismissed", []);
  const networthSnapshotRef = useRef<NetworthSnap>(
    readJSON<NetworthSnap>("finyk_networth_last_snap", {
      date: null,
      value: null,
    }) ?? { date: null, value: null },
  );

  // Stage 8 PR #057k-tombstone — overlay every slot value from the
  // local SQLite cache once it's warm. The `useReadonlyPersist` reads
  // above stay as a synchronous first-paint fallback (LS may still
  // contain residual data for the current boot), but LS writes are
  // gone: the dual-write pipeline (`useFinykDualWriteSync`) is the
  // sole persistence sink.
  const sqliteCacheTick = useFinykSqliteReadTick();
  useEffect(() => {
    const cache = getCachedFinykSqliteState();
    if (cache.refreshedAt === null) return;
    setHiddenAccounts(cache.hiddenAccounts);
    setHiddenTxIds(cache.hiddenTransactions);
    setBudgets(cache.budgets);
    setSubscriptions(cache.subscriptions);
    setManualAssets(cache.manualAssets);
    setManualDebts(cache.manualDebts);
    setReceivables(cache.receivables);
    setCustomCategories(cache.customCategories);
    setManualExpenses(cache.manualExpenses);
    setTxCategories(cache.txCategories);
    setTxSplits(cache.txSplits);
    setMonoDebtLinkedTxIds(cache.monoDebtLinkedTxIds);
    setNetworthHistory(cache.networthHistory);
    if (cache.monthlyPlan !== null) setMonthlyPlan(cache.monthlyPlan);
    // Stage 13 / PR #075 — `excluded_stat_tx_ids_json` /
    // `dismissed_recurring_json` тепер їдуть через `finyk_prefs`,
    // тож overlay-имо їх із кеша. `null` означає, що prefs-row ще
    // не існує — лишаємо локальний first-paint state.
    if (cache.excludedStatTxIds !== null) {
      setExcludedStatTxIds(cache.excludedStatTxIds);
    }
    if (cache.dismissedRecurring !== null) {
      setDismissedRecurring(cache.dismissedRecurring);
    }
    // `networth_last_snap` ref slot is intentionally NOT mirrored to
    // SQLite — it's a per-device dashboard hint, not part of the
    // dual-write contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sqliteCacheTick]);

  return {
    hiddenAccounts,
    setHiddenAccounts,
    budgets,
    setBudgets,
    subscriptions,
    setSubscriptions,
    manualAssets,
    setManualAssets,
    manualDebts,
    setManualDebts,
    receivables,
    setReceivables,
    hiddenTxIds,
    setHiddenTxIds,
    monthlyPlan,
    setMonthlyPlan,
    txCategories,
    setTxCategories,
    monoDebtLinkedTxIds,
    setMonoDebtLinkedTxIds,
    networthHistory,
    setNetworthHistory,
    txSplits,
    setTxSplits,
    customCategories,
    setCustomCategories,
    manualExpenses,
    setManualExpenses,
    excludedStatTxIds,
    setExcludedStatTxIds,
    dismissedRecurring,
    setDismissedRecurring,
    networthSnapshotRef,
  };
}

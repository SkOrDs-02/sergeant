import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { DEFAULT_SUBSCRIPTIONS } from "../constants";
import { readJSON, finykStorageManager } from "../lib/finykStorage";
import { usePersist, reportSilentError } from "./useStorage.persist";
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
 * Reader hook: registers всі persisted slots Finyk-у через `usePersist`
 * (localStorage + debounced write) і повертає bundle із значеннями та
 * сетерами. Mutation/backup helpers поверх цього використовують slots,
 * не торкаючись React state самостійно.
 */
export function useFinykStorageSlots(): FinykStorageSlots {
  const [hiddenAccounts, setHiddenAccounts] = usePersist<string[]>(
    "finyk_hidden",
    [],
  );
  const [budgets, setBudgets] = usePersist<Budget[]>("finyk_budgets", []);
  const [subscriptions, setSubscriptions] = usePersist<Subscription[]>(
    "finyk_subs",
    DEFAULT_SUBSCRIPTIONS as Subscription[],
  );
  const [manualAssets, setManualAssets] = usePersist<ManualAsset[]>(
    "finyk_assets",
    [],
  );
  const [manualDebts, setManualDebts] = usePersist<Debt[]>("finyk_debts", []);
  const [receivables, setReceivables] = usePersist<Receivable[]>(
    "finyk_recv",
    [],
  );
  const [hiddenTxIds, setHiddenTxIds] = usePersist<string[]>(
    "finyk_hidden_txs",
    [],
  );
  const [monthlyPlan, setMonthlyPlan] = usePersist<MonthlyPlan>(
    "finyk_monthly_plan",
    defaultMonthlyPlan,
  );
  const [txCategories, setTxCategories] = usePersist<TxCategoriesMap>(
    "finyk_tx_cats",
    {},
  );
  const [monoDebtLinkedTxIds, setMonoDebtLinkedTxIds] =
    usePersist<MonoDebtLinkedMap>("finyk_mono_debt_linked", {});
  const [networthHistory, setNetworthHistory] = usePersist<NetworthEntry[]>(
    "finyk_networth_history",
    [],
  );
  const [txSplits, setTxSplits] = usePersist<TxSplitsMap>(
    "finyk_tx_splits",
    {},
  );
  const [customCategories, setCustomCategories] = usePersist<CustomCategory[]>(
    "finyk_custom_cats_v1",
    [],
  );
  const [manualExpenses, setManualExpenses] = usePersist<ManualExpense[]>(
    "finyk_manual_expenses_v1",
    [],
  );
  const [excludedStatTxIds, setExcludedStatTxIds] = usePersist<string[]>(
    "finyk_excluded_stat_txs",
    [],
  );
  const [dismissedRecurring, setDismissedRecurring] = usePersist<string[]>(
    "finyk_rec_dismissed",
    [],
  );
  const networthSnapshotRef = useRef<NetworthSnap>(
    readJSON<NetworthSnap>("finyk_networth_last_snap", {
      date: null,
      value: null,
    }) ?? { date: null, value: null },
  );

  // Stage 4 PR #037 — overlay every slot value from the local SQLite
  // cache once it's warm. The LS-backed `usePersist` reads above stay
  // as a synchronous first-paint fallback, so a cold start renders
  // identically to the dual-write era; the SQLite cache snaps in on
  // the next render once `useFinykSqliteReadBoot` warms it. Stage 8
  // PR #057k-flag dropped the `feature.finyk.sqlite_v2.read_sqlite`
  // gate; the overlay is now unconditional.
  //
  // We deliberately call each setter (rather than swap the slot bundle
  // out wholesale) so the subsequent `usePersist` debounced LS write
  // keeps LS in sync with the cache during cutover. PR #057k-tombstone
  // drops the LS-write path once 100% of users are on the SQLite read.
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
    // `excludedStatTxIds`, `dismissedRecurring` and the `networth_last_snap`
    // ref slot are intentionally NOT mirrored to SQLite (yet) — PR #036
    // dual-write only covers the 14 cloud-sync keys, so the cache has
    // nothing to overlay for them.
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

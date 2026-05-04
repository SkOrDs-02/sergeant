import { useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { DEFAULT_SUBSCRIPTIONS } from "../constants";
import { readJSON, finykStorageManager } from "../lib/finykStorage";
import { usePersist, reportSilentError } from "./useStorage.persist";
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

import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { MerchantRule } from "@sergeant/finyk-domain/lib/merchantRules";
import { readJSON, readRaw, finykStorageManager } from "../lib/finykStorage";
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
  TxNotesMap,
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
  /**
   * Слоти вже перекриті (overlay) знімком прогрітого SQLite-кешу; до того
   * вони показують LS-знімок першого кадру. Це НЕ «кеш прогрітий»
   * (`refreshedAt !== null`): `refreshedAt` ставиться всередині запису ще до
   * закриття mutation-вікна, а overlay іде лише з наступним тіком читального
   * гейта. У проміжку кеш уже теплий, а слоти ще ні.
   */
  storageReady: boolean;
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
  /** User's own free-text annotation per bank transaction (LS-only —
   * not part of the SQLite dual-write mirror, same as `finyk_tx_filters_v1`). */
  txNotes: TxNotesMap;
  setTxNotes: Dispatch<SetStateAction<TxNotesMap>>;
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
  /**
   * Правила «Завжди так для цього магазину» (2026-10-01). Живуть у
   * `finyk_prefs.prefs_json`, а не в LS: слот стартує порожнім і вкочується
   * з SQLite-кешу, тож до `storageReady` правил немає (як і в усіх prefs).
   */
  merchantRules: MerchantRule[];
  setMerchantRules: Dispatch<SetStateAction<MerchantRule[]>>;
  /**
   * Balance-visibility flag (Stage 13 PR #074). LS first-paint fallback,
   * SQLite-overlay once warm. Mutations flow through dual-write —
   * `setShowBalance` does NOT write LS.
   */
  showBalance: boolean;
  setShowBalance: Dispatch<SetStateAction<boolean>>;
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
  // Fresh installs start with zero subscriptions. The old default was
  // `DEFAULT_SUBSCRIPTIONS` (the owner's preset catalog), which made a
  // brand-new visitor see "7 активних" підписок they never added
  // (live-deploy audit 2026-06-11). Existing installs keep their
  // stored `finyk_subs` value untouched.
  const [subscriptions, setSubscriptions] = useReadonlyPersist<Subscription[]>(
    "finyk_subs",
    [],
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
  const [txNotes, setTxNotes] = useReadonlyPersist<TxNotesMap>(
    "finyk_tx_notes",
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
  // Правила мерчантів: нового LS-ключа свідомо немає — слот живе лише в
  // SQLite (`prefs_json`) і sync-у, переносити нема чого.
  const [merchantRules, setMerchantRules] = useState<MerchantRule[]>([]);
  // Stage 13 PR #074 — `finyk_show_balance_v1` slot. Default `true`
  // (UI shows balances unless user toggled off). Raw-string LS shape
  // (`"0"` / `"1"`), не JSON, тож беремо ручну useState + readRaw
  // замість useReadonlyPersist (який readJSON-ить).
  const [showBalance, setShowBalance] = useState<boolean>(
    () => readRaw("finyk_show_balance_v1", "1") !== "0",
  );
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
  // Seeded with `-1` (never a real tick — the gate counts up from 0) so
  // an ALREADY warm cache is applied on the first render. Seeding with
  // the live tick meant "warmed before this hook mounted" produced no
  // change and therefore no overlay at all: `useHubChatStorageBoot`
  // warms the finyk cache app-wide and `bootFinykSqliteReadPath` is
  // `booted`-guarded, so by the time the lazy `/finyk` shell mounts the
  // only refresh has already happened. Authenticated sessions hid it —
  // sync pulls keep bumping the tick — but an anonymous visitor has no
  // sync, so their own expenses stayed invisible after reload
  // (measured 2026-08-06).
  const [prevSqliteTick, setPrevSqliteTick] = useState(-1);
  // Готовність = «overlay застосовано», а не «кеш прогрітий»: тільки в кадрі
  // overlay слоти (зокрема `merchantRules`, яких немає в LS) несуть стан
  // користувача, а не дефолти. Dual-write (`useFinykDualWriteSync`) і гейти UI
  // читають саме це.
  const [overlayApplied, setOverlayApplied] = useState(false);
  if (sqliteCacheTick !== prevSqliteTick) {
    setPrevSqliteTick(sqliteCacheTick);
    const cache = getCachedFinykSqliteState();
    setOverlayApplied(cache.refreshedAt !== null);
    if (cache.refreshedAt !== null) {
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
      if (cache.excludedStatTxIds !== null) {
        setExcludedStatTxIds(cache.excludedStatTxIds);
      }
      if (cache.dismissedRecurring !== null) {
        setDismissedRecurring(cache.dismissedRecurring);
      }
      if (cache.showBalance !== null) {
        setShowBalance(cache.showBalance);
      }
      if (cache.merchantRules !== null) {
        setMerchantRules(cache.merchantRules);
      }
    }
  }

  return {
    // LS-знімок вище лише перший кадр: у `finyk_tx_cats` більше ніхто не
    // пише, тож до overlay категорії й приховані операції застарілі.
    storageReady: overlayApplied,
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
    txNotes,
    setTxNotes,
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
    merchantRules,
    setMerchantRules,
    showBalance,
    setShowBalance,
    networthSnapshotRef,
  };
}

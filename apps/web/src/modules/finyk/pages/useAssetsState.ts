import { useEffect, useMemo, useRef, useState } from "react";
import { isMonoDebt } from "../utils";
import {
  computeAssetsSummary,
  filterVisibleAccounts,
} from "@sergeant/finyk-domain/domain/assets/aggregates";
import { computeFinykSchedule, startOfToday } from "../lib/upcomingSchedule";
import { motionScrollBehavior } from "@shared/lib/ui/motion";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { manualExpenseToTransaction } from "@sergeant/finyk-domain/domain/transactions";

// AI-NOTE: Props mirror the original Assets component signature from FinykApp.
// The original component was untyped; we use loose structural types here to
// preserve backwards compatibility without introducing strict coupling.
//
// `storage` lists only the slice of `useStorage()` that this hook actually
// destructures — keeping the prop honest about its real surface and letting
// tests / alternate callers supply lightweight stand-ins without satisfying
// the full 47-field hook signature.
type StorageSlice = Pick<
  ReturnType<typeof import("../hooks/useStorage").useStorage>,
  | "hiddenAccounts"
  | "toggleHideAccount"
  | "manualAssets"
  | "setManualAssets"
  | "manualDebts"
  | "setManualDebts"
  | "receivables"
  | "setReceivables"
  | "setLinkedTxRole"
  | "subscriptions"
  | "setSubscriptions"
  | "updateSubscription"
  | "addSubscriptionFromRecurring"
  | "dismissedRecurring"
  | "dismissRecurring"
  | "excludedTxIds"
  | "monoDebtLinkedTxIds"
  | "toggleMonoDebtTx"
  | "customCategories"
  | "manualExpenses"
>;

type AccountLike = Partial<MonoAccount> & {
  id?: string | undefined;
  balance?: number | undefined;
  currencyCode?: number | undefined;
  [extra: string]: unknown;
};

/** Loose duck-typed jar shape — mirrors `MonoJarDto` fields this hook reads. */
export type JarLike = {
  id?: string | undefined;
  monoJarId?: string | undefined;
  title?: string | null | undefined;
  balance?: number | null | undefined;
  goal?: number | null | undefined;
  currencyCode?: number | undefined;
  [extra: string]: unknown;
};

export type AssetsProps = {
  mono: {
    accounts: AccountLike[];
    transactions: readonly Transaction[];
    loadingTx?: boolean;
    error?: unknown;
    refetchTransactions?: () => void;
    jars?: readonly JarLike[] | undefined;
  };
  storage: StorageSlice;
  showBalance?: boolean;
  initialOpenDebt?: boolean;
  initialOpenSubscriptions?: boolean;
};

export type SectionOpenState = {
  subscriptions: boolean;
  assets: boolean;
  liabilities: boolean;
};

export function useAssetsState({
  mono,
  storage,
  showBalance = true,
  initialOpenDebt = false,
  initialOpenSubscriptions = false,
}: AssetsProps) {
  const {
    accounts,
    transactions,
    loadingTx,
    error,
    refetchTransactions,
    jars,
  } = mono;
  const {
    hiddenAccounts,
    toggleHideAccount,
    manualAssets,
    setManualAssets,
    manualDebts,
    setManualDebts,
    receivables,
    setReceivables,
    setLinkedTxRole,
    subscriptions,
    setSubscriptions,
    updateSubscription,
    addSubscriptionFromRecurring,
    dismissedRecurring,
    dismissRecurring,
    excludedTxIds,
    monoDebtLinkedTxIds,
    toggleMonoDebtTx,
    customCategories,
    manualExpenses,
  } = storage;

  const linkableTransactions = useMemo(
    () => [
      ...transactions,
      ...(manualExpenses ?? []).map((expense) =>
        manualExpenseToTransaction(expense),
      ),
    ],
    [manualExpenses, transactions],
  );

  const [showAssetForm, setShowAssetForm] = useState(false);
  const [showDebtForm, setShowDebtForm] = useState(initialOpenDebt);
  const [showRecvForm, setShowRecvForm] = useState(false);
  const [showSubForm, setShowSubForm] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [editingRecvId, setEditingRecvId] = useState<string | null>(null);
  const [newAsset, setNewAsset] = useState({
    name: "",
    amount: "",
    currency: "UAH",
    emoji: "\u{1F4B0}",
  });
  const [newDebt, setNewDebt] = useState({
    name: "",
    emoji: "\u{1F4B8}",
    totalAmount: "",
    dueDate: "",
  });
  const [newRecv, setNewRecv] = useState({
    name: "",
    emoji: "\u{1F464}",
    amount: "",
    note: "",
    dueDate: "",
  });
  const [newSub, setNewSub] = useState<{
    name: string;
    emoji: string;
    keyword: string;
    billingDay: string | number;
    currency: string;
  }>({
    name: "",
    emoji: "\u{1F4F1}",
    keyword: "",
    billingDay: "",
    currency: "UAH",
  });
  type TxPicker =
    | { type: "sub"; subId: string }
    | { type: "recv"; id: string }
    | { type: "debt"; id: string }
    | { type: "monoDebt"; id: string }
    | null;
  const [txPicker, setTxPicker] = useState<TxPicker>(null);
  const [open, setOpen] = useState<SectionOpenState>({
    subscriptions: initialOpenSubscriptions,
    assets: false,
    liabilities: initialOpenDebt,
  });
  const assetFormRef = useRef<HTMLElement | null>(null);
  const assetNameInputRef = useRef<HTMLInputElement | null>(null);
  const debtFormRef = useRef<HTMLElement | null>(null);
  const debtNameInputRef = useRef<HTMLInputElement | null>(null);

  const monoAccounts = accounts as MonoAccount[];
  const assetsSummary = computeAssetsSummary({
    accounts: monoAccounts,
    hiddenAccounts,
    manualAssets: manualAssets.map((asset) => ({
      id: asset.id,
      name: asset.name ?? "",
      amount: asset.amount,
      currency: asset.currency ?? "",
      ...(asset.emoji !== undefined ? { emoji: asset.emoji } : {}),
    })),
    manualDebts,
    receivables,
    transactions,
    jars: (jars ?? []).map((j) => ({
      id: j.monoJarId ?? j.id,
      title: j.title,
      balance: j.balance,
      goal: j.goal,
      currencyCode: j.currencyCode,
    })),
  });
  const {
    monoBalance: monoTotal,
    monoDebt: monoTotalDebt,
    totalLiabilities: totalDebt,
    receivableTotal: totalReceivable,
    manualAssetTotal,
    jarsTotal,
    networth,
    totalAssets,
  } = assetsSummary;
  const monoDebtAccounts = filterVisibleAccounts(
    monoAccounts,
    hiddenAccounts,
  ).filter((a) => isMonoDebt(a));

  const [todayStart] = useState<Date>(startOfToday);

  const { urgentLiability, subsMonthly } = useMemo(
    () =>
      computeFinykSchedule({
        subscriptions,
        manualDebts,
        receivables,
        transactions: [...transactions],
        todayStart,
      }),
    [subscriptions, manualDebts, receivables, transactions, todayStart],
  );

  // Єдиний вхід у кожну форму — quick-action-ряд угорі сторінки. Раніше
  // ті самі кнопки дублювались усередині розгорнутих секцій і кожна з них
  // скидала стан редагування сама; після зняття дублів (звіт власника
  // 2026-09-03) скидання живе тут, інакше «+ Актив» після редагування
  // відкривав би форму з чужими значеннями.
  const openSubscriptionForm = () => {
    setOpen((v) => ({ ...v, subscriptions: true }));
    setShowSubForm(true);
  };
  const openAssetForm = () => {
    setOpen((v) => ({ ...v, assets: true }));
    setEditingAssetId(null);
    setNewAsset({ name: "", amount: "", currency: "UAH", emoji: "" });
    setShowAssetForm(true);
  };
  const openReceivableForm = () => {
    setOpen((v) => ({ ...v, assets: true }));
    setEditingRecvId(null);
    setNewRecv({ name: "", emoji: "", amount: "", note: "", dueDate: "" });
    setShowRecvForm(true);
  };
  const openDebtForm = () => {
    setOpen((v) => ({ ...v, liabilities: true }));
    setEditingDebtId(null);
    setNewDebt({ name: "", emoji: "", totalAmount: "", dueDate: "" });
    setShowDebtForm(true);
  };

  useEffect(() => {
    if (!showAssetForm || !open.assets) return;
    const frame = requestAnimationFrame(() => {
      assetFormRef.current?.scrollIntoView({
        behavior: motionScrollBehavior(),
        block: "start",
      });
      try {
        assetNameInputRef.current?.focus({ preventScroll: true });
      } catch {
        assetNameInputRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [showAssetForm, open.assets]);

  useEffect(() => {
    if (!showDebtForm || !open.liabilities) return;
    const frame = requestAnimationFrame(() => {
      debtFormRef.current?.scrollIntoView({
        behavior: motionScrollBehavior(),
        block: "start",
      });
      try {
        debtNameInputRef.current?.focus({ preventScroll: true });
      } catch {
        debtNameInputRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [showDebtForm, open.liabilities]);

  return {
    // Raw data from props
    accounts,
    jars: jars ?? [],
    jarsTotal,
    transactions: linkableTransactions,
    loadingTx: Boolean(loadingTx),
    transactionsError: error,
    refetchTransactions,
    showBalance,

    // Storage-derived
    hiddenAccounts,
    toggleHideAccount,
    manualAssets,
    setManualAssets,
    manualDebts,
    setManualDebts,
    receivables,
    setReceivables,
    setLinkedTxRole,
    subscriptions,
    setSubscriptions,
    updateSubscription,
    addSubscriptionFromRecurring,
    dismissedRecurring,
    dismissRecurring,
    excludedTxIds,
    monoDebtLinkedTxIds,
    toggleMonoDebtTx,
    customCategories,

    // Computed totals
    monoTotal,
    monoTotalDebt,
    monoDebtAccounts,
    totalDebt,
    totalReceivable,
    manualAssetTotal,
    networth,
    totalAssets,
    todayStart,
    urgentLiability,
    subsMonthly,

    // Section toggle state
    open,
    setOpen,

    // Form visibility
    showAssetForm,
    setShowAssetForm,
    showDebtForm,
    setShowDebtForm,
    showRecvForm,
    setShowRecvForm,
    showSubForm,
    setShowSubForm,
    editingAssetId,
    setEditingAssetId,
    editingDebtId,
    setEditingDebtId,
    editingRecvId,
    setEditingRecvId,

    // Form data
    newAsset,
    setNewAsset,
    newDebt,
    setNewDebt,
    newRecv,
    setNewRecv,
    newSub,
    setNewSub,

    // Refs
    assetFormRef,
    assetNameInputRef,
    debtFormRef,
    debtNameInputRef,

    // Transaction picker
    txPicker,
    setTxPicker,

    // Quick-action openers
    openSubscriptionForm,
    openAssetForm,
    openReceivableForm,
    openDebtForm,
  };
}

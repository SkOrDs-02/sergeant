import { useEffect, useMemo, useRef, useState } from "react";
import {
  getMonoTotals,
  isMonoDebt,
  calcDebtRemaining,
  calcReceivableRemaining,
} from "../utils";
import { filterVisibleAccounts } from "@sergeant/finyk-domain/domain/assets/aggregates";
import { computeFinykSchedule, startOfToday } from "../lib/upcomingSchedule";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";
import type { Tx } from "@sergeant/finyk-domain/domain/debtEngine";

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
  | "manualAssets"
  | "setManualAssets"
  | "manualDebts"
  | "setManualDebts"
  | "receivables"
  | "setReceivables"
  | "toggleLinkedTx"
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
>;

export type AssetsProps = {
  mono: { accounts: MonoAccount[]; transactions: Tx[] };
  storage: StorageSlice;
  showBalance?: boolean;
  initialOpenDebt?: boolean;
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
}: AssetsProps) {
  const { accounts, transactions } = mono;
  const {
    hiddenAccounts,
    manualAssets,
    setManualAssets,
    manualDebts,
    setManualDebts,
    receivables,
    setReceivables,
    toggleLinkedTx,
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
  } = storage;

  const [showAssetForm, setShowAssetForm] = useState(false);
  const [showDebtForm, setShowDebtForm] = useState(initialOpenDebt);
  const [showRecvForm, setShowRecvForm] = useState(false);
  const [showSubForm, setShowSubForm] = useState(false);
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
    subscriptions: false,
    assets: false,
    liabilities: initialOpenDebt,
  });
  const assetFormRef = useRef<HTMLElement | null>(null);
  const assetNameInputRef = useRef<HTMLInputElement | null>(null);
  const debtFormRef = useRef<HTMLElement | null>(null);
  const debtNameInputRef = useRef<HTMLInputElement | null>(null);

  const { balance: monoTotal, debt: monoTotalDebt } = getMonoTotals(
    accounts,
    hiddenAccounts,
  );
  const monoDebtAccounts = filterVisibleAccounts(
    accounts,
    hiddenAccounts,
  ).filter((a) => isMonoDebt(a));
  const manualDebtTotal = manualDebts.reduce(
    (s, d) => s + calcDebtRemaining(d, transactions),
    0,
  );
  const totalDebt = monoTotalDebt + manualDebtTotal;
  const totalReceivable = receivables.reduce(
    (s, r) => s + calcReceivableRemaining(r, transactions),
    0,
  );
  const manualAssetTotal = manualAssets
    .filter((a) => a.currency === "UAH")
    .reduce((s, a) => s + Number(a.amount), 0);
  const networth = monoTotal + manualAssetTotal + totalReceivable - totalDebt;
  const totalAssets = monoTotal + manualAssetTotal + totalReceivable;

  const [todayStart] = useState<Date>(startOfToday);

  const { urgentLiability } = useMemo(
    () =>
      computeFinykSchedule({
        subscriptions,
        manualDebts,
        receivables,
        transactions,
        todayStart,
      }),
    [subscriptions, manualDebts, receivables, transactions, todayStart],
  );

  const openSubscriptionForm = () => {
    setOpen((v) => ({ ...v, subscriptions: true }));
    setShowSubForm(true);
  };
  const openAssetForm = () => {
    setOpen((v) => ({ ...v, assets: true }));
    setShowAssetForm(true);
  };
  const openDebtForm = () => {
    setOpen((v) => ({ ...v, liabilities: true }));
    setShowDebtForm(true);
  };

  useEffect(() => {
    if (!showAssetForm || !open.assets) return;
    const frame = requestAnimationFrame(() => {
      assetFormRef.current?.scrollIntoView({
        behavior: "smooth",
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
        behavior: "smooth",
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
    transactions,
    showBalance,

    // Storage-derived
    hiddenAccounts,
    manualAssets,
    setManualAssets,
    manualDebts,
    setManualDebts,
    receivables,
    setReceivables,
    toggleLinkedTx,
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
    openDebtForm,
  };
}

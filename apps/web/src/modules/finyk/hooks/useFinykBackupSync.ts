import { notifyFinykRoutineCalendarSync } from "../hubRoutineSync";
import {
  normalizeFinykBackup,
  normalizeFinykSyncPayload,
  FINYK_BACKUP_VERSION,
  type FinykBackup,
} from "../lib/finykBackup";
import { downloadJson, toLocalISODate } from "@sergeant/shared";
import { reportSilentError } from "./useStorage.persist";
import type {
  Subscription,
  Budget,
  ManualAsset,
  CustomCategory,
  TxCategoriesMap,
  MonoDebtLinkedMap,
  MonthlyPlan,
  NetworthEntry,
  Debt,
  Receivable,
  TxSplitsMap,
} from "./useStorage.types";
import type { FinykStorageSlots } from "./useFinykStorageSlots";

interface BackupToast {
  success: (msg: string) => number;
  error: (msg: string) => number;
}

/**
 * Backup / sync helpers: експорт у JSON, імпорт з файлу, коротко-тривалий
 * sync через URL-парам (`?sync=...`). Це окремий шар поверх `slots`, бо
 * усі ці методи зачіпають великий під-сет setter-ів одразу і логічно
 * описують один контракт ("міграція цілого Finyk-стану з/у бекап").
 */
export function useFinykBackupSync(
  slots: FinykStorageSlots,
  toast: BackupToast | undefined,
) {
  const {
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
    hiddenAccounts,
    setHiddenAccounts,
    hiddenTxIds,
    setHiddenTxIds,
    monthlyPlan,
    setMonthlyPlan,
    txCategories,
    setTxCategories,
    txSplits,
    setTxSplits,
    monoDebtLinkedTxIds,
    setMonoDebtLinkedTxIds,
    networthHistory,
    setNetworthHistory,
    customCategories,
    setCustomCategories,
    dismissedRecurring,
    setDismissedRecurring,
  } = slots;

  const applyData = (data: FinykBackup) => {
    if (data.budgets) setBudgets(data.budgets as Budget[]);
    if (data.subscriptions)
      setSubscriptions(data.subscriptions as Subscription[]);
    if (data.manualAssets) setManualAssets(data.manualAssets as ManualAsset[]);
    if (data.manualDebts) setManualDebts(data.manualDebts as Debt[]);
    if (data.receivables) setReceivables(data.receivables as Receivable[]);
    if (data.hiddenAccounts) setHiddenAccounts(data.hiddenAccounts as string[]);
    if (data.hiddenTxIds) setHiddenTxIds(data.hiddenTxIds as string[]);
    if (data.monthlyPlan) setMonthlyPlan(data.monthlyPlan as MonthlyPlan);
    if (data.txCategories)
      setTxCategories(data.txCategories as TxCategoriesMap);
    if (data.txSplits) setTxSplits(data.txSplits as TxSplitsMap);
    if (data.monoDebtLinkedTxIds)
      setMonoDebtLinkedTxIds(data.monoDebtLinkedTxIds as MonoDebtLinkedMap);
    if (data.networthHistory)
      setNetworthHistory(data.networthHistory as NetworthEntry[]);
    if (data.customCategories)
      setCustomCategories(data.customCategories as CustomCategory[]);
    if (data.dismissedRecurring)
      setDismissedRecurring(data.dismissedRecurring as string[]);
    notifyFinykRoutineCalendarSync();
  };

  const exportData = async () => {
    const data = {
      version: FINYK_BACKUP_VERSION,
      budgets,
      subscriptions,
      manualAssets,
      manualDebts,
      receivables,
      hiddenAccounts,
      hiddenTxIds,
      monthlyPlan,
      txCategories,
      txSplits,
      monoDebtLinkedTxIds,
      networthHistory,
      customCategories,
      dismissedRecurring,
    };
    await downloadJson(`finyk-backup-${toLocalISODate()}.json`, data);
  };

  /** @returns {Promise<boolean>} */
  const importData = (file: Blob): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target!.result as string);
          const normalized = normalizeFinykBackup(parsed);
          applyData(normalized);
          toast?.success("Дані імпортовано.");
          resolve(true);
        } catch (err) {
          reportSilentError("import data", err);
          const raw =
            err instanceof Error ? err.message : "невірний формат файлу";
          const msg = raw.startsWith("Помилка:") ? raw : `Помилка: ${raw}`;
          toast?.error(msg);
          resolve(false);
        }
      };
      reader.onerror = () => {
        toast?.error("Помилка: не вдалось прочитати файл");
        resolve(false);
      };
      reader.readAsText(file);
    });

  // Sync: без прихованих рахунків/транзакцій (device-specific). v3 — категорії, спліти, борги mono, нетворс.
  const generateSyncLink = () => {
    const data = {
      v: 3,
      b: budgets,
      s: subscriptions,
      a: manualAssets,
      d: manualDebts,
      r: receivables,
      mp: monthlyPlan,
      tc: txCategories,
      ts: txSplits,
      md: monoDebtLinkedTxIds,
      nh: networthHistory,
      cc: customCategories,
      dr: dismissedRecurring,
    };
    const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
    return `${window.location.origin}${window.location.pathname}?sync=${encoded}`;
  };

  const loadFromUrl = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const encoded = params.get("sync");
      if (!encoded) return false;
      const raw = JSON.parse(decodeURIComponent(atob(encoded)));
      const normalized = normalizeFinykSyncPayload(raw);
      applyData(normalized);
      window.history.replaceState({}, "", window.location.pathname);
      return true;
    } catch (err) {
      reportSilentError("load sync from url", err);
      return false;
    }
  };

  return {
    applyData,
    exportData,
    importData,
    generateSyncLink,
    loadFromUrl,
  };
}

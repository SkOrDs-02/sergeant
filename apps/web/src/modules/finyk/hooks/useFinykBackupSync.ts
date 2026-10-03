import { notifyFinykRoutineCalendarSync } from "../hubRoutineSync";
import {
  normalizeFinykBackup,
  FINYK_BACKUP_VERSION,
  type FinykBackup,
} from "../lib/finykBackup";
import { downloadJson, toKyivISODate } from "@sergeant/shared";
import { sanitizeMerchantRules } from "@sergeant/finyk-domain/lib/merchantRules";
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
 * Backup helpers: експорт у JSON та імпорт з файлу. Це окремий шар поверх `slots`, бо
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
    excludedStatTxIds,
    setExcludedStatTxIds,
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
    merchantRules,
    setMerchantRules,
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
    if (data.excludedStatTxIds)
      setExcludedStatTxIds(data.excludedStatTxIds as string[]);
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
    if (data.merchantRules)
      setMerchantRules(sanitizeMerchantRules(data.merchantRules));
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
      excludedStatTxIds,
      monthlyPlan,
      txCategories,
      txSplits,
      monoDebtLinkedTxIds,
      networthHistory,
      customCategories,
      dismissedRecurring,
      merchantRules,
    };
    await downloadJson(`finyk-backup-${toKyivISODate()}.json`, data);
  };

  /** @returns {Promise<boolean>} */
  const importData = (file: Blob): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const result = e.target?.result;
          if (typeof result !== "string") {
            throw new Error("неправильний формат файлу");
          }
          const parsed = JSON.parse(result);
          const normalized = normalizeFinykBackup(parsed);
          applyData(normalized);
          toast?.success("Дані імпортовано.");
          resolve(true);
        } catch (err) {
          // Технічна деталь іде у звіт, а не на екран. У цей catch доходять
          // рівно два джерела — виняток `JSON.parse` (англомовний, з
          // позицією в буфері) і локальний `new Error("неправильний формат
          // файлу")`; `normalizeFinykBackup` не кидає нічого. Обидва
          // показувались людині з префіксом «Помилка: », тобто §7 (заборонена
          // standalone-конструкція) і §3 («без stack-trace-у») порушувались
          // одним рядком. PR-X3, аудит 2026-09-13.
          reportSilentError("import data", err);
          // Дія у ТЕКСТІ, а не кнопкою, і це навмисно: цей файл у allowlist
          // `require-toast-error-action`, бо хук приймає готовий `Blob` і не
          // володіє файловим input-ом, тож «Обери інший» звідси не підняти.
          toast?.error(
            "Не вдалось прочитати резервну копію: файл пошкоджений або не той. Обери інший.",
          );
          resolve(false);
        }
      };
      reader.onerror = () => {
        toast?.error("Не вдалось прочитати файл. Обери інший.");
        resolve(false);
      };
      reader.readAsText(file);
    });

  return {
    applyData,
    exportData,
    importData,
  };
}

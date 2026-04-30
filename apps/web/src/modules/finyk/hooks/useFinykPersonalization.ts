import { useMemo } from "react";
import {
  getFrequentCategories,
  getFrequentMerchants,
  type ManualExpense,
} from "@sergeant/finyk-domain/domain/personalization";
import type {
  Category,
  Transaction,
} from "@sergeant/finyk-domain/domain/types";

// Memo-обгортка навколо чистих селекторів персоналізації. Повертає список
// найчастіших категорій і мерчантів для поточного користувача — використовується
// у quick add, dashboard-картках та в компонентах, що сортують UI за частотою.
interface PersonalizationOptions {
  mono?: { realTx?: readonly Transaction[] };
  storage?: {
    manualExpenses?: readonly ManualExpense[];
    customCategories?: Category[];
    txCategories?: Record<string, string>;
    excludedTxIds?: Set<string>;
  };
  now?: Date;
}

export function useFinykPersonalization({
  mono,
  storage,
  now,
}: PersonalizationOptions = {}) {
  const rawTransactions = mono?.realTx;
  const rawManualExpenses = storage?.manualExpenses;
  const rawCustomCategories = storage?.customCategories;
  const rawTxCategories = storage?.txCategories;
  const rawExcludedTxIds = storage?.excludedTxIds;

  // Стабілізуємо посилання — селектори приймають readonly-дані, а падаючі
  // `undefined → []` кожного рендера ламали dep-array useMemo.
  const transactions = useMemo(() => rawTransactions || [], [rawTransactions]);
  const manualExpenses = useMemo(
    () => rawManualExpenses || [],
    [rawManualExpenses],
  );
  const customCategories = useMemo(
    () => rawCustomCategories || [],
    [rawCustomCategories],
  );
  const txCategories = useMemo(() => rawTxCategories || {}, [rawTxCategories]);

  // `storage.excludedTxIds` — `new Set(...)` збирається у useStorage кожного
  // рендера, тож її посилання нестабільне. Використовуємо відсортований вміст
  // як invalidate-ключ: однакові id → однаковий ключ → посилання не міняється.
  // (Розмір як proxy не годиться: при swap "hide X, unhide Y" size однаковий,
  // а вміст інший — селектори отримали б застарілий фільтр.)
  const excludedTxIdsKey = useMemo(() => {
    if (!rawExcludedTxIds || rawExcludedTxIds.size === 0) return "";
    return Array.from(rawExcludedTxIds).sort().join("|");
  }, [rawExcludedTxIds]);
  const excludedTxIds = useMemo(
    () => rawExcludedTxIds || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [excludedTxIdsKey],
  );

  const opts = useMemo(
    () => ({ customCategories, excludedTxIds, txCategories, now }),
    [customCategories, excludedTxIds, txCategories, now],
  );

  const frequentCategories = useMemo(
    () => getFrequentCategories(transactions, manualExpenses, opts),
    [transactions, manualExpenses, opts],
  );

  const frequentMerchants = useMemo(
    () => getFrequentMerchants(transactions, manualExpenses, opts),
    [transactions, manualExpenses, opts],
  );

  // Простий boolean — без useMemo (rule 5.3): cost of memo comparison > cost
  // of a single `.some()` on ≤8 елементів.
  const hasSignal = frequentCategories.some((c) => c.count >= 2);

  return { frequentCategories, frequentMerchants, hasSignal };
}

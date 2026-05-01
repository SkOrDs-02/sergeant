// Web-обгортка над чистим фінансовим контекстом з `@sergeant/insights`.
// Читає `localStorage` один раз і готує похідні дані (canonical-id сумарні,
// множини transferIds тощо), щоб окремі правила не дублювали парсинг.
//
// Навмисно — тут не використовується typedStore: існуючі LS-ключі читаються
// у старому форматі, а міграція — окрема фіча (див. `migrateFinykStorage`).
// Правила (у пакеті `@sergeant/insights`) платформо-незалежні; цей файл —
// єдина точка, де контекст «запікається» з Web-LS.

import { getCategory } from "../../../modules/finyk/utils";
import { getCategorySpendList } from "@sergeant/finyk-domain/domain/categories";
import type { TxSplitsLike } from "@sergeant/finyk-domain/lib/transactions";
import { manualCategoryToCanonicalId } from "@sergeant/finyk-domain/domain/personalization";
import { Recommendations } from "@sergeant/insights";
import { safeReadLS } from "@shared/lib/storage";

type FinanceContext = Recommendations.FinanceContext;
type Transaction = Recommendations.Transaction;
type ManualExpense = Recommendations.ManualExpense;
type Budget = Recommendations.Budget;
type CustomCategory = Recommendations.CustomCategory;

// Реекспортуємо тип для консумерів у web, щоб шлях імпорту лишався знайомим.
export type { FinanceContext };
// Реекспортуємо helper для консумерів у web (історично жив тут).
export const txTimestamp = Recommendations.txTimestamp;

function safeLS<T>(key: string, fallback: T): T {
  return safeReadLS<T>(key, fallback) ?? fallback;
}

function startOfCurrentMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface TxSplit {
  categoryId?: string;
  amount?: number;
}

function readSplits(txSplits: TxSplitsLike, id: string): readonly TxSplit[] {
  const v = txSplits[id];
  return Array.isArray(v) ? (v as readonly TxSplit[]) : [];
}

export function buildFinanceContext(): FinanceContext {
  const now = new Date();
  const monthStart = startOfCurrentMonth();
  const monthStartMs = monthStart.getTime();

  const txCache = safeLS<{ txs?: Transaction[] } | Transaction[] | null>(
    "finyk_tx_cache",
    null,
  );
  const transactions: Transaction[] = Array.isArray(txCache)
    ? txCache
    : (txCache?.txs ?? []);

  const budgets = safeLS<Budget[]>("finyk_budgets", []);
  const txCategories = safeLS<Record<string, string>>("finyk_tx_cats", {});
  const customCategories = safeLS<CustomCategory[]>("finyk_custom_cats_v1", []);
  const hiddenTxIds = new Set(safeLS<string[]>("finyk_hidden_txs", []));
  const transferIds = new Set(
    Object.entries(txCategories)
      .filter(([, v]) => v === "internal_transfer")
      .map(([k]) => k),
  );
  const manualExpenses = safeLS<ManualExpense[]>(
    "finyk_manual_expenses_v1",
    [],
  );
  const txSplitsRaw = safeLS<TxSplitsLike>("finyk_tx_splits", {});
  const txSplits: TxSplitsLike =
    txSplitsRaw && typeof txSplitsRaw === "object" ? txSplitsRaw : {};

  const thisMonthTx = transactions.filter((tx) => {
    if (hiddenTxIds.has(tx.id)) return false;
    if (transferIds.has(tx.id)) return false;
    return txTimestamp(tx) >= monthStartMs;
  });

  // Legacy categorySpend (raw override keys) — збережено для сумісності з
  // правилами, де categoryId бюджету може не збігатися з canonical id.
  // budgetLimitsRule використовує як fallback після canonicalMonthSpend.
  const categorySpend: Record<string, number> = {};
  for (const tx of thisMonthTx) {
    if ((tx.amount ?? 0) >= 0) continue;
    const splits = readSplits(txSplits, tx.id);
    if (splits.length > 0) {
      for (const s of splits) {
        if (!s.categoryId || s.categoryId === "internal_transfer") continue;
        const amt = Math.abs(Number(s.amount) || 0);
        if (amt <= 0) continue;
        categorySpend[s.categoryId] = (categorySpend[s.categoryId] || 0) + amt;
      }
    } else {
      const catId = txCategories[tx.id] || "other";
      categorySpend[catId] =
        (categorySpend[catId] || 0) + Math.abs(tx.amount / 100);
    }
  }
  for (const me of manualExpenses) {
    const ts = new Date(me.date).getTime();
    if (ts < monthStartMs) continue;
    const catId = me.category || "other";
    categorySpend[catId] = (categorySpend[catId] || 0) + Math.abs(me.amount);
  }

  // Canonical-id витрати — делегуємо до getCategorySpendList (єдине
  // джерело правди для Finyk Overview, Budgets і Hub).
  const spendList = getCategorySpendList(thisMonthTx, {
    txCategories,
    txSplits,
    customCategories,
  });
  const canonicalMonthSpend = new Map<string, number>();
  for (const { id, spent } of spendList) {
    canonicalMonthSpend.set(id, spent);
  }
  // Ручні витрати — додаємо поверх результатів getCategorySpendList.
  for (const me of manualExpenses) {
    if (new Date(me.date).getTime() < monthStartMs) continue;
    const canonKey = manualCategoryToCanonicalId(me.category) || "other";
    if (canonKey === "internal_transfer") continue;
    canonicalMonthSpend.set(
      canonKey,
      (canonicalMonthSpend.get(canonKey) || 0) +
        Math.abs(Number(me.amount) || 0),
    );
  }

  // canonicalTotalCount — лічильник транзакцій за ВСЕ завантажене (не лише
  // поточний місяць); використовується правилом `frequentNoBudget`.
  const canonicalTotalCount = new Map<string, number>();
  for (const tx of transactions) {
    if (hiddenTxIds.has(tx.id) || transferIds.has(tx.id)) continue;
    if ((tx.amount ?? 0) >= 0) continue;
    const splits = readSplits(txSplits, tx.id);
    if (splits.length > 0) {
      for (const s of splits) {
        if (!s.categoryId || s.categoryId === "internal_transfer") continue;
        canonicalTotalCount.set(
          s.categoryId,
          (canonicalTotalCount.get(s.categoryId) || 0) + 1,
        );
      }
    } else {
      const override = txCategories[tx.id] || null;
      const cat = getCategory(
        tx.description || "",
        tx.mcc || 0,
        override,
        customCategories,
      );
      const catId = cat?.id;
      if (!catId || catId === "internal_transfer") continue;
      canonicalTotalCount.set(catId, (canonicalTotalCount.get(catId) || 0) + 1);
    }
  }
  for (const me of manualExpenses) {
    const key = manualCategoryToCanonicalId(me.category) || "other";
    if (key === "internal_transfer") continue;
    canonicalTotalCount.set(key, (canonicalTotalCount.get(key) || 0) + 1);
  }

  const limits = budgets.filter((b) => b.type === "limit");

  return {
    now,
    monthStart,
    transactions,
    manualExpenses,
    budgets,
    limits,
    txCategories,
    customCategories,
    hiddenTxIds,
    transferIds,
    thisMonthTx,
    categorySpend,
    canonicalMonthSpend,
    canonicalTotalCount,
  };
}

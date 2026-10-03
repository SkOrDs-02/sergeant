// Web-обгортка над чистим фінансовим контекстом з `@sergeant/insights`.
// Дані беруться з того самого всесвіту, що й решта дашборду:
// `readFinykStatsContext` (Mono mirror + ручні записи з SQLite-кешу,
// канонічний excluded-set, оверрайди категорій, бюджети).
//
// AI-CONTEXT (сліпий замір 2026-09-24, Р5 спеки аналітики v2): до цього
// патча файл читав `finyk_budgets` і `finyk_manual_expenses_v1` з
// localStorage. Обидва ключі tombstoned і дренаються на буті, тож на
// будь-якому пристрої після дрену `limits` був порожній, `budget_over_*`
// не спрацьовував ніколи, і хаб писав «перевищень немає» поруч із карткою
// «використано 162 % ліміту». Стан лімітів тепер рахує `calcLimitUsages`:
// той самий прохід, що й картка ліміту в Плануванні та хаб-картка.
//
// Правила (у пакеті `@sergeant/insights`) платформо-незалежні; цей файл —
// єдина точка, де контекст «запікається» з Web-даних.

import { getCategory } from "../../../modules/finyk/utils";
import { getCategorySpendList } from "@sergeant/finyk-domain/domain/categories";
import { calcLimitUsages } from "@sergeant/finyk-domain/domain/budget";
import type { TxSplitsLike } from "@sergeant/finyk-domain/lib/transactions";
import { manualCategoryToCanonicalId } from "@sergeant/finyk-domain/domain/personalization";
import { resolveManualExpenseKind } from "@sergeant/finyk-domain/domain/transactions";
import { INTERNAL_TRANSFER_ID } from "@finyk/constants";
import { Recommendations } from "@sergeant/insights";
import { getVisibleFinykMonoMirrorState } from "../../../modules/finyk/lib/monoMirrorReader";
import { readFinykStatsContext } from "../../../modules/finyk/lib/lsStats";
import { getCachedFinykSqliteState } from "../../../modules/finyk/lib/sqliteReader";

type FinanceContext = Recommendations.FinanceContext;
type Transaction = Recommendations.Transaction;
type CustomCategory = Recommendations.CustomCategory;

// Реекспортуємо тип для консумерів у web, щоб шлях імпорту лишався знайомим.
export type { FinanceContext };
// Реекспортуємо helper для консумерів у web (історично жив тут).
export const txTimestamp = Recommendations.txTimestamp;

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

  const stats = readFinykStatsContext();
  const transactions: Transaction[] = getVisibleFinykMonoMirrorState()
    .transactions as Transaction[];

  const { budgets, txCategories } = stats;
  const txSplits = stats.txSplits as TxSplitsLike;
  const customCategories: CustomCategory[] = stats.customCategories.map(
    (c) => ({ id: c.id, label: c.label ?? c.name ?? c.id }),
  );
  const hiddenTxIds = new Set(stats.hiddenTxIds);
  const transferIds = new Set(
    Object.entries(txCategories)
      .filter(([, v]) => v === INTERNAL_TRANSFER_ID)
      .map(([k]) => k),
  );
  // `@sergeant/insights`' ManualExpense contract is expense-only (its rules
  // add every entry's `amount` straight to spend/velocity/pace totals).
  // The manual-income feature (fab-and-manual-income spec) writes income
  // rows into the same table, so they must be filtered out here — otherwise
  // a salary entry would count as spending in every AI-advice rule.
  const manualExpenses = getCachedFinykSqliteState().manualExpenses.filter(
    (e) => resolveManualExpenseKind(e) === "expense",
  );

  const thisMonthTx = transactions.filter((tx) => {
    if (hiddenTxIds.has(tx.id)) return false;
    if (transferIds.has(tx.id)) return false;
    return txTimestamp(tx) >= monthStartMs;
  });

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
    if (canonKey === INTERNAL_TRANSFER_ID) continue;
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
        if (!s.categoryId || s.categoryId === INTERNAL_TRANSFER_ID) continue;
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
      if (!catId || catId === INTERNAL_TRANSFER_ID) continue;
      canonicalTotalCount.set(catId, (canonicalTotalCount.get(catId) || 0) + 1);
    }
  }
  for (const me of manualExpenses) {
    const key = manualCategoryToCanonicalId(me.category) || "other";
    if (key === INTERNAL_TRANSFER_ID) continue;
    canonicalTotalCount.set(key, (canonicalTotalCount.get(key) || 0) + 1);
  }

  const limits = budgets.filter((b) => b.type === "limit");

  // Стан лімітів: універсум `bank + manual` без прихованих і виключених зі
  // статистики, вікно періоду кожного ліміту накладає сам `calcLimitUsages`.
  const statTx = stats.txs.filter((tx) => !stats.excludedTxIds.has(tx.id));
  const limitUsage = calcLimitUsages(budgets, statTx, {
    txCategories,
    txSplits,
    customCategories: stats.customCategories,
    now,
  });

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
    txSplits,
    thisMonthTx,
    limitUsage,
    canonicalMonthSpend,
    canonicalTotalCount,
  };
}

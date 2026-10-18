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
import { shiftDayKey } from "@sergeant/finyk-domain/domain/weekSlices";
import { Recommendations } from "@sergeant/insights";
import { kyivDayStartMs, toKyivISODate } from "@sergeant/shared";
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

/**
 * Правий край «цього місяця» для сум і карток (мс, виключно): початок
 * наступного місяця АБО кінець сьогоднішньої київської доби, що раніше.
 * Запис, датований наперед (запланована ручна витрата), у «цього місяця»
 * не входить: Звіти хабу рахують до сьогодні (logic-08). Початок місяця
 * лишається за пристроєм, київську межу місяця не вводимо (hub-coach.md,
 * журнал 2026-10-01).
 */
function monthUpperBoundMs(monthStart: Date, nowMs: number): number {
  /* eslint-disable sergeant-design/prefer-kyiv-time -- ADR-0078: початок місяця хабу лишається за пристроєм (hub-coach.md, журнал 2026-10-01); верхня межа ходить парою з ним */
  const nextMonthStartMs = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    1,
  ).getTime();
  /* eslint-enable sergeant-design/prefer-kyiv-time */
  const endOfTodayMs = kyivDayStartMs(shiftDayKey(toKyivISODate(nowMs), 1));
  return Math.min(nextMonthStartMs, endOfTodayMs);
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
  const monthEndMs = monthUpperBoundMs(monthStart, now.getTime());

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
  // Канонічний excluded-set (bank + manual: «Не враховувати», дебіторка, пари
  // «Скасування», tx-level перекази) — той самий, що читають Огляд і звіт
  // тижня. Раніше правила бачили лише hidden + перекази з мапи, тож
  // виключене й скасоване роздувало темп (logic-08).
  const excludedTxIds = stats.excludedTxIds;
  // `@sergeant/insights`' ManualExpense contract is expense-only (its rules
  // add every entry's `amount` straight to spend/velocity/pace totals).
  // The manual-income feature (fab-and-manual-income spec) writes income
  // rows into the same table, so they must be filtered out here — otherwise
  // a salary entry would count as spending in every AI-advice rule.
  // Виключені/сховані ручні записи теж відпадають: їхній id у всесвіті —
  // `manual_<id>`.
  const manualExpenses = getCachedFinykSqliteState().manualExpenses.filter(
    (e) =>
      resolveManualExpenseKind(e) === "expense" &&
      !Recommendations.isManualExpenseExcluded(excludedTxIds, e),
  );

  const thisMonthTx = transactions.filter((tx) => {
    if (excludedTxIds.has(tx.id)) return false;
    const ts = txTimestamp(tx);
    return ts >= monthStartMs && ts < monthEndMs;
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
    const meTs = new Date(me.date).getTime();
    if (meTs < monthStartMs || meTs >= monthEndMs) continue;
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
    if (excludedTxIds.has(tx.id)) continue;
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
  const statTx = stats.txs.filter((tx) => !excludedTxIds.has(tx.id));
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
    excludedTxIds,
    txSplits,
    thisMonthTx,
    limitUsage,
    canonicalMonthSpend,
    canonicalTotalCount,
  };
}

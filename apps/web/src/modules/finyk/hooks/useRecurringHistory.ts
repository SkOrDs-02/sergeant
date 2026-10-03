/**
 * Last validated: 2026-10-01
 * Status: Active
 */
import { useEffect } from "react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import { kyivMonthRangeIso } from "../lib/monthWindow";
import { useFinykMirrorTransactions } from "./useFinykStatTransactions";
import type { FetchBankRange } from "./useMonthlyTrend";

/**
 * Скільки ЗАВЕРШЕНИХ місяців дотягувати в дзеркало. Вікно детекції —
 * `RECURRING_LOOKBACK_DAYS` (120 днів): чотири повні минулі місяці плюс
 * поточний покривають його за будь-якого дня місяця.
 */
const HISTORY_MONTHS = 4;

/** Від початку місяця `-HISTORY_MONTHS` до кінця минулого (Київ). */
function historyRange(): { from: string; to: string } {
  const { year, month } = getKyivDateParts();
  const idx = year * 12 + (month - 1);
  const at = (i: number) => kyivMonthRangeIso(Math.floor(i / 12), (i % 12) + 1);
  return { from: at(idx - HISTORY_MONTHS).from, to: at(idx - 1).to };
}

/**
 * Банківська історія для детектора регулярних платежів.
 *
 * AI-CONTEXT: детектор годували `mono.transactions`, а той змінює зміст
 * разом зі станом завантаження: до відповіді мережі це все SQLite-дзеркало,
 * після неї лише поточний київський місяць (`useMonobankWebhook`). Кандидати
 * на підписку зʼявлялись і зникали хвилями. Тут джерело одне й не залежить
 * від завантаження — дзеркало, а вікно історії ріже сам `detectRecurring`
 * (`RECURRING_LOOKBACK_DAYS`).
 *
 * Дзеркало наповнюється помісячно (відкриті місяці), тож хук один раз
 * дотягує завершені місяці вікна — як `useMonthlyTrend` для тренду.
 * Без банку чи мережі лишається те, що вже є в дзеркалі.
 */
export function useRecurringHistory(
  fetchRange?: FetchBankRange,
): readonly Transaction[] {
  const bank = useFinykMirrorTransactions();

  useEffect(() => {
    if (!fetchRange) return;
    const { from, to } = historyRange();
    fetchRange(from, to).catch(() => {});
  }, [fetchRange]);

  return bank;
}

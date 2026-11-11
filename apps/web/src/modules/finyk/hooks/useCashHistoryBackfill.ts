import { useEffect } from "react";
import type { FetchBankRange } from "./useMonthlyTrend";

/**
 * Баланс «Готівки на руках» сумує зняття з SQLite-дзеркала від `createdAt`,
 * а дзеркало пристрою наповнюється лише відкритими місяцями. На новому
 * пристрої чи після виходу баланс був меншим, і поправка звірки закріплювала
 * помилку в синхронізованому стані. Тому історію від створення готівки
 * дотягуємо в дзеркало один раз.
 *
 * ponytail: без гейта на «Вказати фактичну суму», поки запит у дорозі;
 * додати, якщо звірку роблять раніше, ніж дзеркало доповнюється.
 */
export function useCashHistoryBackfill(
  cashCreatedAt: number | undefined,
  fetchRange?: FetchBankRange,
): void {
  useEffect(() => {
    if (!fetchRange || cashCreatedAt === undefined) return;
    fetchRange(
      new Date(cashCreatedAt).toISOString(),
      // eslint-disable-next-line no-restricted-syntax -- UTC-мить «зараз» як межа діапазону, не київська доба
      new Date().toISOString(),
    ).catch(() => {});
  }, [cashCreatedAt, fetchRange]);
}

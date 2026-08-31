/**
 * Last validated: 2026-08-03
 * Status: Active
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { finykKeys } from "@shared/lib/api/queryKeys";
import { authAwareRetry } from "@shared/lib/api/queryClient";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { fetchAllMonoTransactions } from "./monoTransactionsLoader";
import { kyivMonthRangeIso } from "../lib/monthWindow";
import { webhookTxToNormalized } from "./monoTxNormalize";

const TX_STALE = 60_000;

/** Скільки місяців назад пропонуємо у селекті періоду. */
export const LINKABLE_MONTHS_BACK = 24;
/** Ширина дефолтного вікна «останні N днів». */
const RECENT_WINDOW_DAYS = 90;

/**
 * AI-CONTEXT: `useMonobankWebhook` свідомо тягне лише **поточний
 * календарний місяць** — цього досить для Огляду, але не для пікера
 * привʼязки: 3-го числа місяця користувач бачив 7 операцій під написом
 * «Останні 90 днів». Пікер має власний запит із власним діапазоном;
 * серверний `/api/mono/transactions` уже вміє довільний range із
 * курсорною пагінацією (до 10 000 рядків), тож розширення — це лише
 * інші `from`/`to`.
 */
export interface LinkableRange {
  /** `""` — дефолтне вікно «останні 90 днів»; інакше `YYYY-MM`. */
  month: string;
}

function monthBounds(month: string): { from: string; to: string } {
  const [yearRaw, monthRaw] = month.split("-");
  return kyivMonthRangeIso(Number(yearRaw), Number(monthRaw));
}

/**
 * Опції періоду будуються з **календаря**, а не з уже завантажених
 * транзакцій — інакше селект пропонує рівно той місяць, який і так
 * видно, і вибрати старіший неможливо.
 */
export function buildMonthOptions(monthsBack = LINKABLE_MONTHS_BACK): string[] {
  const { year, month } = getKyivDateParts();
  const options: string[] = [];
  for (let offset = 0; offset < monthsBack; offset++) {
    const total = year * 12 + (month - 1) - offset;
    const optionYear = Math.floor(total / 12);
    const optionMonth = (total % 12) + 1;
    options.push(`${optionYear}-${String(optionMonth).padStart(2, "0")}`);
  }
  return options;
}

export interface UseLinkableTransactionsInput extends LinkableRange {
  enabled: boolean;
  /**
   * Уже наявні у памʼяті транзакції (поточний місяць + ручні витрати, які
   * живуть локально й вікна завантаження не мають). Зливаються з
   * підвантаженим діапазоном за `id`.
   */
  base?: readonly Transaction[] | undefined;
  /** Референсний момент; передається у тестах замість `Date.now()`. */
  now?: number | undefined;
}

/**
 * Транзакції-кандидати для привʼязки до боргу / дебіторки.
 *
 * Повертає **весь** запитаний діапазон — жодного додаткового клієнтського
 * відсіву за датою. Пошук по опису/сумі лишається у самому пікері.
 */
export function useLinkableTransactions({
  month,
  enabled,
  base,
  now,
}: UseLinkableTransactionsInput) {
  // Референсний момент фіксуємо один раз на монтування: інакше кожен
  // рендер дає новий `to`, а з ним — новий queryKey і нескінченний
  // рефетч. Читання годинника під час рендера теж заборонене.
  const [mountedAt] = useState(() => now ?? Date.now());
  const range = useMemo(() => {
    if (month) return monthBounds(month);
    const reference = now ?? mountedAt;
    return {
      from: new Date(
        reference - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString(),
      to: new Date(reference).toISOString(),
    };
  }, [month, now, mountedAt]);

  const query = useQuery({
    queryKey: finykKeys.monoWebhookTransactions(`${range.from}|${range.to}`),
    queryFn: ({ signal }) =>
      fetchAllMonoTransactions({ from: range.from, to: range.to }, { signal }),
    enabled,
    staleTime: TX_STALE,
    retry: authAwareRetry(2),
  });

  const transactions: Transaction[] = useMemo(() => {
    const byId = new Map<string, Transaction>();
    for (const tx of query.data ?? []) {
      const normalized = webhookTxToNormalized(tx);
      byId.set(normalized.id, normalized);
    }
    // База (поточний місяць + ручні витрати) не має перетиратися
    // підвантаженим діапазоном — але й дублюватися теж.
    for (const tx of base ?? []) if (!byId.has(tx.id)) byId.set(tx.id, tx);
    return [...byId.values()].sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  }, [query.data, base]);

  return {
    transactions,
    loading: query.isLoading && enabled,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  comparisonWindow,
  monthKeysOf,
  type AnalyticsPeriod,
} from "@sergeant/finyk-domain/domain/analyticsPeriod";
import { shiftDayKey } from "@sergeant/finyk-domain/domain/weekSlices";
import { manualExpenseToTransaction } from "@sergeant/finyk-domain/domain/transactions";
import type { ManualExpense } from "@sergeant/finyk-domain/domain/personalization";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import {
  earliestKyivDayKey,
  filterToKyivDays,
  filterToKyivMonth,
} from "../lib/monthWindow";
import { isMonoNotConnectedError } from "../lib/monoBankErrors";

interface AnalyticsPeriodDataInput {
  period: AnalyticsPeriod;
  /** Сьогоднішній київський день `YYYY-MM-DD`. */
  todayKey: string;
  realTx: readonly Transaction[] | undefined;
  fetchMonth: (year: number, month0Based: number) => Promise<Transaction[]>;
  manualExpenses: ManualExpense[] | undefined;
}

/**
 * Дані обраного періоду Аналітики і вікна для порівняння (Р5). Банк
 * поточного місяця йде з `realTx`, кожен минулий місяць, який зачіпає
 * період, порівняння чи «зонд» перед ним, тягне `fetchMonth` у кеш
 * сторінки; ручні витрати поверх; усе кламплене київськими днями.
 *
 * Читання йде з нашого сервера, а не з Monobank: його ліміт (1 запит на
 * хвилину) діє лише на серверний backfill виписки, тож рік (до 25 місяців)
 * вантажиться звичайними запитами, а прогрес видно через `pending/needed`.
 */
export function useAnalyticsPeriodData({
  period,
  todayKey,
  realTx,
  fetchMonth,
  manualExpenses,
}: AnalyticsPeriodDataInput) {
  const currentMonthKey = todayKey.slice(0, 7);
  const isCurrent = period.fromKey <= todayKey && todayKey <= period.toKey;
  const comparison = useMemo(
    () => comparisonWindow(period, todayKey),
    [period, todayKey],
  );

  // Місяці періоду, порівняння і «зонд» (місяць перед початком порівняння).
  // Без зонда найраніший відомий запис часто лежить на краю завантаженого,
  // і чесний стан «дані лише з …» (Р5.5) спрацьовував би хибно.
  // Місяці після поточного (решта незавершеного року) ще не настали.
  const { periodMonths, comparisonMonths, neededMonths } = useMemo(() => {
    const p = monthKeysOf(period.fromKey, period.toKey).filter(
      (m) => m <= currentMonthKey,
    );
    const c = monthKeysOf(comparison.fromKey, comparison.toKey);
    const probe = shiftDayKey(`${comparison.fromKey.slice(0, 7)}-01`, -1).slice(
      0,
      7,
    );
    return {
      periodMonths: p,
      comparisonMonths: [...c, probe],
      neededMonths: [...new Set([...p, ...c, probe])],
    };
  }, [period, comparison, currentMonthKey]);

  // In-memory cache of fetched historical months. Keyed by "YYYY-MM".
  // No localStorage — source of truth is the server; React Query handles
  // HTTP-level caching so repeated navigations don't re-fetch.
  const [monthCache, setMonthCache] = useState<Record<string, Transaction[]>>(
    {},
  );
  const [loading, setLoading] = useState(false);
  // Помилки читання ПО МІСЯЦЯХ, а не одна на сторінку. Дві причини.
  //
  // 1) Реєстр упалих місяців розриває нескінченний цикл: `mono` приходить
  //    новим обʼєктом на КОЖЕН рендер (`useMonobankWebhook` повертає
  //    літерал, `useUnifiedFinanceData` його перепаковує), тож `ensureMonth`
  //    міняв ідентичність, ефекти нижче перезапускались, місяця в кеші не
  //    було — і fetch стартував знову: реджект → `setFetchError` → рендер →
  //    новий fetch → реджект. Саме через цей цикл кнопка «Повторити»
  //    виглядала мертвою: вона таки перезапускала читання, але плашка
  //    поверталась за мілісекунди від наступної спроби.
  // 2) Ключ = місяць, тож провал ФОНОВОГО fetch-у місяця, який тягнуть лише
  //    заради «Порівняння», не малює червону плашку над періодом, що
  //    завантажився нормально.
  const [fetchErrors, setFetchErrors] = useState<Record<string, string>>({});
  const fetchingRef = useRef(new Set<string>());

  const fetchError =
    periodMonths.map((m) => fetchErrors[m]).find(Boolean) ?? null;

  // `fetchMonth` — стабільний `useCallback` усередині `useMonobankWebhook`,
  // на відміну від обгортки `mono`, тож ідентичність `ensureMonth`
  // міняється лише від реальних змін.
  const ensureMonth = useCallback(
    (key: string) => {
      if (fetchingRef.current.has(key)) return;
      if (monthCache[key]) return;
      // Місяць уже впав — не перезапускаємо самі. Перезапуск робить
      // «Повторити», і лише він (див. цикл в описі `fetchErrors`).
      if (fetchErrors[key]) return;
      fetchingRef.current.add(key);
      void Promise.resolve().then(() => {
        setLoading(true);
      });
      const [y, m] = key.split("-").map(Number) as [number, number];
      fetchMonth(y, m - 1)
        .then((txs) => {
          setMonthCache((prev) => ({ ...prev, [key]: txs }));
          // Успіх гасить плашку саме цього місяця — доти вона лишалась на
          // екрані навіть після того, як дані приїхали.
          setFetchErrors((prev) => {
            if (!(key in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          });
        })
        .catch((err: unknown) => {
          if (isMonoNotConnectedError(err)) {
            // Банку просто немає — це порожній місяць, а не збій. Кладемо
            // порожній зріз у кеш, щоб секції показали empty-state, а не
            // червону плашку (у людини з самими ручними витратами вона
            // висіла назавжди й не зникала після «Повторити»).
            setMonthCache((prev) => ({ ...prev, [key]: [] }));
            return;
          }
          // Не отруюємо кеш порожнім масивом — тимчасовий збій має
          // лишатись перезапускним. Порожній ключ у кеші виглядав би як
          // чесний «0 ₴».
          setFetchErrors((prev) => ({
            ...prev,
            [key]: "Не вдалось завантажити операції",
          }));
        })
        .finally(() => {
          fetchingRef.current.delete(key);
          // Keep the loading indicator on while any other month fetch is
          // still in flight; flipping to `false` unconditionally would
          // hide loading whenever the first parallel fetch resolves.
          setLoading(fetchingRef.current.size > 0);
        });
    },
    [fetchMonth, monthCache, fetchErrors],
  );

  // «Повторити» = зняти позначки провалу і викинути кеш усіх місяців
  // періоду й порівняння. Обидва `set*` віддають НОВІ обʼєкти, тож
  // `ensureMonth` міняє ідентичність і ефект нижче перезапускає читання —
  // це і є справжній ретрай, а не лише ховання плашки.
  const retry = useCallback(() => {
    const drop = (prev: Record<string, unknown>) => {
      const next = { ...prev };
      for (const m of neededMonths) delete next[m];
      return next;
    };
    setFetchErrors((prev) => drop(prev) as Record<string, string>);
    setMonthCache((prev) => drop(prev) as Record<string, Transaction[]>);
  }, [neededMonths]);

  useEffect(() => {
    for (const m of neededMonths) {
      if (m < currentMonthKey) ensureMonth(m);
    }
  }, [neededMonths, currentMonthKey, ensureMonth]);

  const isLoaded = useCallback(
    (m: string) => m >= currentMonthKey || m in monthCache,
    [currentMonthKey, monthCache],
  );

  // AI-DANGER: банківський зріз ОБОВʼЯЗКОВО клампиться по місяцю, як в
  // Огляді (`useOverviewData`) і Бюджетах (`Budgets.tsx`).
  //
  // `mono.realTx` — це `overlayTransactions` із `useMonobankWebhook`: коли
  // мережевий зріз поточного місяця порожній (холодний старт, перше число
  // місяця), він підставляє ВЕСЬ SQLite-mirror. Відколи `fetchMonth`
  // backfill-ить дзеркало історією, цей overlay тягне сюди кожен
  // синхронізований місяць — і «Підсумок» показував би суму за весь час.
  // Це той самий клас бага, що й founder-репорт 2026-07-31 («Витрати
  // 128 842 ₴ за серпень» першого числа), лише інша поверхня.
  //
  // Клампимо й `monthCache`-гілку: вона приходить із місяцевого fetch-у, але
  // його межі анкорені на фіксований `+03:00`, а `filterToKyivMonth` — на
  // справжній київський зсув, тож взимку краї місяця розходяться на годину.
  // Кожен місяць клампиться окремо, тож сусідні місяці не дублюють рядки.
  const bankOfMonths = useCallback(
    (months: readonly string[]) =>
      months.flatMap((m) =>
        filterToKyivMonth(
          m === currentMonthKey ? realTx || [] : monthCache[m] || [],
          m,
        ),
      ),
    [currentMonthKey, realTx, monthCache],
  );

  // Ручні витрати не в банківському потоці, тож зливаються явно — інакше
  // Аналітика показувала б 0 ₴ там, де Операції їх перелічують. Межі
  // київські, а не host-local (`new Date(year, month-1, 1)` викидав запис
  // «2026-08-01» із серпня на пристрої західніше Києва, §1.8).
  const manualTxs = useMemo(
    () => (manualExpenses ?? []).map((e) => manualExpenseToTransaction(e)),
    [manualExpenses],
  );

  // Банківський зріз ОКРЕМО від обʼєднаного: на ньому — і тільки на ньому —
  // гейтиться банер помилки завантаження. Доти гейт стояв на обʼєднаному
  // списку, тож ОДНА ручна витрата ховала збій читання банку разом із
  // єдиною кнопкою «Повторити» (аудит 2026-09-16, WF-6).
  const bankTx = useMemo(
    () =>
      filterToKyivDays(
        bankOfMonths(periodMonths),
        period.fromKey,
        period.toKey,
      ),
    [bankOfMonths, periodMonths, period],
  );

  const allActiveTx = useMemo(() => {
    const manual = filterToKyivDays(manualTxs, period.fromKey, period.toKey);
    return manual.length === 0 ? bankTx : [...bankTx, ...manual];
  }, [bankTx, manualTxs, period]);

  // Незавершений період міряється тими ж днями попереднього (див.
  // `comparisonWindow`): 27 днів вересня проти 31 дня серпня давали «−33 %»
  // при незмінному темпі, тоді як картка звітів хаба (#52) казала «−23 %».
  const allPrevTx = useMemo(
    () =>
      filterToKyivDays(
        [...bankOfMonths(comparisonMonths), ...manualTxs],
        comparison.fromKey,
        comparison.toKey,
      ),
    [bankOfMonths, comparisonMonths, manualTxs, comparison],
  );

  // Найраніший відомий запис: з нього стан «дані лише з …» (Р5.5).
  const historyStartKey = useMemo(
    () =>
      earliestKyivDayKey([
        realTx ?? [],
        manualTxs,
        ...Object.values(monthCache),
      ]),
    [realTx, manualTxs, monthCache],
  );

  const pendingMonths = neededMonths.filter((m) => !isLoaded(m)).length;

  return {
    isCurrent,
    comparison,
    loading,
    fetchError,
    retry,
    bankTx,
    allActiveTx,
    allPrevTx,
    prevLoaded: comparisonMonths.every(isLoaded),
    periodLoaded: periodMonths.every(isLoaded),
    historyStartKey,
    neededMonths: neededMonths.length,
    pendingMonths,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { manualExpenseToTransaction } from "@sergeant/finyk-domain/domain/transactions";
import type { ManualExpense } from "@sergeant/finyk-domain/domain/personalization";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import { filterToKyivFirstDays, filterToKyivMonth } from "../lib/monthWindow";
import { isMonoNotConnectedError } from "../lib/monoBankErrors";

interface AnalyticsMonthDataInput {
  year: number;
  /** 1-12. */
  month: number;
  realTx: readonly Transaction[] | undefined;
  fetchMonth: (year: number, month0Based: number) => Promise<Transaction[]>;
  manualExpenses: ManualExpense[] | undefined;
}

/**
 * Дані обраного місяця Аналітики і місяця для порівняння: банк поточного
 * місяця з `realTx`, минулі місяці з `fetchMonth` у кеші сторінки, ручні
 * витрати поверх, усе кламплене за Києвом.
 */
export function useAnalyticsMonthData({
  year,
  month,
  realTx,
  fetchMonth,
  manualExpenses,
}: AnalyticsMonthDataInput) {
  const nowKyiv = getKyivDateParts();
  const isCurrentMonth = year === nowKyiv.year && month === nowKyiv.month;

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
  // 2) Ключ = місяць, тож провал ФОНОВОГО fetch-у попереднього місяця
  //    (його тягнуть лише заради секції «Порівняння») більше не малює
  //    червону плашку над місяцем, який завантажився нормально.
  const [fetchErrors, setFetchErrors] = useState<Record<string, string>>({});
  const fetchingRef = useRef(new Set<string>());

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const fetchError = fetchErrors[monthKey] ?? null;

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

  // Fetch a month from the server (via mono.fetchMonth → React Query)
  // and store the result in the in-memory cache. `fetchMonth` — стабільний
  // `useCallback` усередині `useMonobankWebhook`, на відміну від обгортки
  // `mono`, тож ідентичність `ensureMonth` міняється лише від реальних змін.
  const ensureMonth = useCallback(
    (y: number, m1: number, key: string) => {
      if (fetchingRef.current.has(key)) return;
      if (monthCache[key]) return;
      // Місяць уже впав — не перезапускаємо самі. Перезапуск робить
      // «Повторити», і лише він (див. цикл в описі `fetchErrors`).
      if (fetchErrors[key]) return;
      fetchingRef.current.add(key);
      void Promise.resolve().then(() => {
        setLoading(true);
      });
      fetchMonth(y, m1 - 1)
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

  // «Повторити» = зняти позначку провалу і викинути кеш обраного місяця
  // (та попереднього, який живить «Порівняння»). Обидва `set*` віддають
  // НОВІ обʼєкти, тож `ensureMonth` міняє ідентичність і ефекти нижче
  // перезапускають читання — це і є справжній ретрай, а не лише ховання
  // плашки.
  const retry = useCallback(() => {
    setFetchErrors((prev) => {
      if (!(monthKey in prev) && !(prevKey in prev)) return { ...prev };
      const next = { ...prev };
      delete next[monthKey];
      delete next[prevKey];
      return next;
    });
    setMonthCache((prev) => {
      const next = { ...prev };
      delete next[monthKey];
      delete next[prevKey];
      return next;
    });
  }, [monthKey, prevKey]);

  useEffect(() => {
    if (!isCurrentMonth) ensureMonth(year, month, monthKey);
  }, [isCurrentMonth, year, month, monthKey, ensureMonth]);

  useEffect(() => {
    ensureMonth(prevYear, prevMonth, prevKey);
  }, [prevYear, prevMonth, prevKey, ensureMonth]);

  // Manual expenses for the currently selected month.
  // storage (localStorage-backed), not in the server tx stream, so they
  // must be merged into `activeTx` explicitly — otherwise Analytics shows
  // 0 ₴ even when Transactions clearly lists them. See useTransactionFilters
  // for the source-of-truth merge pattern.
  // §1.8: host-local `new Date(year, month-1, 1)` bounds put an entry
  // dated "2026-08-01" outside August for any device west of Kyiv (its
  // UTC-midnight instant lands before the host's local month start).
  // `filterToKyivMonth` is the same Kyiv-anchored clamp the bank slice
  // below already uses, reuse it instead of a second, host-local rule.
  const manualExpenseTxs = useMemo(() => {
    if (!manualExpenses || manualExpenses.length === 0) {
      return [] as Transaction[];
    }
    return filterToKyivMonth(
      manualExpenses.map((e) => manualExpenseToTransaction(e)),
      monthKey,
    );
  }, [manualExpenses, monthKey]);

  const prevManualExpenseTxs = useMemo(() => {
    if (!manualExpenses || manualExpenses.length === 0) {
      return [] as Transaction[];
    }
    return filterToKyivMonth(
      manualExpenses.map((e) => manualExpenseToTransaction(e)),
      prevKey,
    );
  }, [manualExpenses, prevKey]);

  // AI-DANGER: банківський зріз ОБОВʼЯЗКОВО клампиться по місяцю, як в
  // Огляді (`useOverviewData`) і Бюджетах (`Budgets.tsx`). Ручні витрати
  // вище вже вікноавані, а банківські — ні, і саме ця асиметрія робила
  // Аналітику єдиною поверхнею Фініка без клампу.
  //
  // `mono.realTx` — це `overlayTransactions` із `useMonobankWebhook`: коли
  // мережевий зріз поточного місяця порожній (холодний старт, перше число
  // місяця), він підставляє ВЕСЬ SQLite-mirror. Відколи `fetchMonth`
  // backfill-ить дзеркало історією, цей overlay тягне сюди кожен
  // синхронізований місяць — і «Підсумок місяця» показував би суму за весь
  // час. Це той самий клас бага, що й founder-репорт 2026-07-31 («Витрати
  // 128 842 ₴ за серпень» першого числа), лише інша поверхня.
  //
  // Клампимо й `monthCache`-гілку: вона приходить із місяцевого fetch-у, але
  // його межі анкорені на фіксований `+03:00`, а `filterToKyivMonth` — на
  // справжній київський зсув, тож взимку краї місяця розходяться на годину.
  // Банківський зріз ОКРЕМО від обʼєднаного: на ньому — і тільки на ньому —
  // гейтиться банер помилки завантаження. Доти гейт стояв на обʼєднаному
  // `activeTx`, тож ОДНА ручна витрата в місяці ховала збій читання банку
  // разом із єдиною кнопкою «Повторити» — а `ensureMonth` навмисно не
  // перезапускає впалий місяць сам, тож стан лишався невідновним до
  // перемикання місяця чи релоаду (аудит 2026-09-16, WF-6).
  const bankTx = useMemo(
    () =>
      filterToKyivMonth(
        isCurrentMonth ? realTx || [] : monthCache[monthKey] || [],
        monthKey,
      ),
    [isCurrentMonth, realTx, monthCache, monthKey],
  );

  const allActiveTx = useMemo(() => {
    if (manualExpenseTxs.length === 0) return bankTx;
    return [...bankTx, ...manualExpenseTxs];
  }, [bankTx, manualExpenseTxs]);

  // Незавершений місяць міряємо тими ж днями попереднього, а не всім ним:
  // 27 днів вересня проти 31 дня серпня давали «−33 %» при незмінному темпі,
  // тоді як картка звітів хаба (#52) на тих самих даних казала «−23 %».
  const allPrevTx = useMemo(() => {
    const prevBankTx = filterToKyivMonth(monthCache[prevKey] || [], prevKey);
    const all =
      prevManualExpenseTxs.length === 0
        ? prevBankTx
        : [...prevBankTx, ...prevManualExpenseTxs];
    return isCurrentMonth ? filterToKyivFirstDays(all, nowKyiv.day) : all;
  }, [monthCache, prevKey, prevManualExpenseTxs, isCurrentMonth, nowKyiv.day]);

  return {
    isCurrentMonth,
    loading,
    fetchError,
    retry,
    bankTx,
    allActiveTx,
    allPrevTx,
    prevLoaded: prevKey in monthCache,
  };
}

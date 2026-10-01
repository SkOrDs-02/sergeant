/**
 * `useNowItems` — купа «Зараз» як один хук: обидва ранкери, один список,
 * dismiss в обидва наявні сховища.
 *
 * Спека: `docs/work/specs/hub-action-axis.md` § «Купа „Зараз“».
 *
 * Чому dismiss іде у ДВА сховища, а не в нове третє. Сьогодні hero тримає
 * відкинуті рекомендації в `hub_recs_dismissed_v1` (мапа id → ts,
 * `useDashboardFocus`), а картки інсайтів — у `sergeant.v2.insights.dismissed`
 * (масив id, `useInsightDismissal`). Обидва мають інших читачів: перше —
 * `useOnboardingState.todayFocusAvailable`, друге — `InsightCard` усередині
 * модулів. Третє сховище розвело б їх: інсайт, відкинутий на головній,
 * повертався б у модулі. Тому об'єднаний рядок пише в обидва (кожен зі
 * своїм id походження), а фільтр читає обидва — рядок зникає, за яким би id
 * його не відкинули.
 *
 * «✕» ховає рядок до кінця ПОТОЧНОЇ особистої доби, не назавжди (рішення
 * власника 2026-10-01; межа доби — годинник пристрою, ADR-0078). Id правил
 * рекомендацій статичні, тож «назавжди» глушило сигнал на весь вік акаунта.
 * Обидва сховища несуть мітку часу, застарілі записи без неї прострочені
 * (`@shared/lib/insights/dismissedToday`). Відкинуте сьогодні — не втрачене:
 * коли «Зараз» порожня лише через це, купа показує «Відкладено N · показати»,
 * а `restorePostponed` повертає ці рядки.
 *
 * Status: Scaffolded
 * @nextStep PR 2 осі дії монтує цей хук у `HubDashboard` (див. `nowItems.ts`).
 */
import { useCallback, useEffect, useState } from "react";
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";
import { useAllInsights } from "@shared/lib/insights/useAllInsights";
import { useInsightDismissal } from "@shared/lib/insights/useInsightDismissal";
import {
  dismissalsOfToday,
  isDismissedToday,
} from "@shared/lib/insights/dismissedToday";
import { generateRecommendations } from "../../lib/recommendationEngine";
import { HUB_RECS_DISMISSED_KEY } from "../../insights/TodayFocusCard";
import { mergeNowItems, type NowItem } from "./nowItems";

/**
 * Рекомендації залежать від часу доби (вечірні нагадування, вікно
 * понеділка), тож список перераховується тим самим кроком, що й
 * `useDashboardFocus`, — раз на дві хвилини.
 */
const RECOMPUTE_INTERVAL_MS = 2 * 60 * 1000;

export interface UseNowItemsResult {
  /** Відсортовано за спаданням пріоритету, без відкинутих сьогодні. Без cap. */
  items: NowItem[];
  /** Пише id походження в обидва сховища (до кінця доби); рядок зникає негайно. */
  dismiss: (item: NowItem) => void;
  /** Скільки рядків сьогодні відкладено («✕») і зараз приховано. */
  postponed: number;
  /** Повертає всі відкладені сьогодні рядки («показати»). */
  restorePostponed: () => void;
}

export function useNowItems(): UseNowItemsResult {
  const [dismissedRecs, setDismissedRecs] = useLocalStorageState<
    Record<string, number>
  >(HUB_RECS_DISMISSED_KEY, {});
  const insightDismissal = useInsightDismissal();

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), RECOMPUTE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Без cap: `useAllInsights` за замовчуванням ріже до 3, а межа купи — справа
  // самої купи (3 розгорнуто + «ще N»), не джерела.
  const insights = useAllInsights({
    surface: "hub",
    cap: Number.POSITIVE_INFINITY,
  });
  // Синхронне читання теплих кешів на кожному рендері — як у
  // `useDashboardFocus`; мемоізувати нема на чому, масив щоразу новий.
  const recs = generateRecommendations();

  const all = mergeNowItems(recs, insights);
  // Відкинуто за БУДЬ-ЯКИМ із двох id, але лише СЬОГОДНІ: вчорашнє і запис без
  // мітки часу не ховають нічого.
  const isPostponed = (item: NowItem) =>
    Boolean(
      (item.recId && isDismissedToday(dismissedRecs[item.recId])) ||
      (item.insightId && insightDismissal.isDismissed(item.insightId)),
    );
  const items = all.filter((item) => !isPostponed(item));
  const postponedItems = all.filter(isPostponed);

  const dismiss = useCallback(
    (item: NowItem) => {
      if (item.recId) {
        const recId = item.recId;
        // Заодно викидаємо прострочені id, щоб мапа не росла.
        setDismissedRecs((prev) => ({
          ...dismissalsOfToday(prev),
          [recId]: Date.now(),
        }));
      }
      if (item.insightId) insightDismissal.dismiss(item.insightId);
    },
    [setDismissedRecs, insightDismissal],
  );

  // Знімає відкидання з обох сховищ для кожного відкладеного рядка (кожен
  // зі своїм id походження).
  const restorePostponed = () => {
    const recIds = postponedItems.flatMap((i) => (i.recId ? [i.recId] : []));
    const insightIds = postponedItems.flatMap((i) =>
      i.insightId ? [i.insightId] : [],
    );
    if (recIds.length > 0) {
      setDismissedRecs((prev) => {
        const next = dismissalsOfToday(prev);
        for (const id of recIds) delete next[id];
        return next;
      });
    }
    if (insightIds.length > 0) insightDismissal.restore(insightIds);
  };

  return {
    items,
    dismiss,
    postponed: postponedItems.length,
    restorePostponed,
  };
}

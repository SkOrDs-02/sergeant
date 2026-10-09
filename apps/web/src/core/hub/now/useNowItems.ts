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
 * Чекбокс рядка (мова H, redesign v3; раніше «✕») переносить рядок у
 * «Закрито» до кінця ПОТОЧНОЇ особистої доби, не назавжди (рішення власника
 * 2026-10-01; межа доби — годинник пристрою, ADR-0078). Id правил
 * рекомендацій статичні, тож «назавжди» глушило сигнал на весь вік акаунта.
 * Обидва сховища несуть мітку часу, застарілі записи без неї прострочені
 * (`@shared/lib/insights/dismissedToday`). Закрите сьогодні видно в купі
 * «Закрито», і тап по ньому (`uncheck`) повертає рядок у «Зараз».
 *
 * Хук викликається ОДИН раз у `HubDashboard`: обидві купи читають той самий
 * стан, бо два інстанси `useLocalStorageState` в одній вкладці не
 * синхронізуються.
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
import { HUB_RECS_DISMISSED_KEY } from "../../insights/dashboardFocus";
import { useHubPref } from "../../settings/hubPrefs";
import {
  mergeNowItems,
  withoutWeekReportTarget,
  type NowItem,
} from "./nowItems";

/**
 * Рекомендації залежать від часу доби (вечірні нагадування, вікно
 * понеділка), тож список перераховується тим самим кроком, що й
 * `useDashboardFocus`, — раз на дві хвилини.
 */
const RECOMPUTE_INTERVAL_MS = 2 * 60 * 1000;

export interface UseNowItemsResult {
  /** Відсортовано за спаданням пріоритету, без відкинутих сьогодні. Без cap. */
  items: NowItem[];
  /** Пише id походження в обидва сховища (до кінця доби); рядок іде в «Закрито». */
  check: (item: NowItem) => void;
  /** Рядки, закриті сьогодні чекбоксом. */
  checked: NowItem[];
  /** Повертає закритий сьогодні рядок у «Зараз». */
  uncheck: (item: NowItem) => void;
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

  // Цільовий блок «Порада й тиждень» вимикається в налаштуваннях: тоді
  // «Відкрити» з тижневої картки веде в модуль, а з крос-модульної (понеділковий
  // «Підсумок минулого тижня») — у вкладку «Звіти» (`withoutWeekReportTarget`).
  const [showInsights] = useHubPref<boolean>("showInsights", true);
  const merged = mergeNowItems(recs, insights);
  const all = showInsights ? merged : merged.map(withoutWeekReportTarget);
  // Відкинуто за БУДЬ-ЯКИМ із двох id, але лише СЬОГОДНІ: вчорашнє і запис без
  // мітки часу не ховають нічого.
  const isPostponed = (item: NowItem) =>
    Boolean(
      (item.recId && isDismissedToday(dismissedRecs[item.recId])) ||
      (item.insightId && insightDismissal.isDismissed(item.insightId)),
    );
  const items = all.filter((item) => !isPostponed(item));
  const checked = all.filter(isPostponed);

  const check = useCallback(
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

  // Знімає закриття з обох сховищ (кожне зі своїм id походження).
  const uncheck = (item: NowItem) => {
    const recId = item.recId;
    if (recId) {
      setDismissedRecs((prev) => {
        const next = dismissalsOfToday(prev);
        delete next[recId];
        return next;
      });
    }
    if (item.insightId) insightDismissal.restore([item.insightId]);
  };

  return { items, check, checked, uncheck };
}

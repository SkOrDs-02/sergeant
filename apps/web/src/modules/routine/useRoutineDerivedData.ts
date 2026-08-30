/**
 * Pure-derived view layer for the Routine calendar.
 *
 * Given the canonical routine state, the time-state (mode + cursor +
 * selected day) and the active filters, derive everything the
 * calendar/stats UI needs to render: the active date range, the
 * filtered + grouped events, the day-count map, the localized labels
 * and the metrics (streak, completion, day progress).
 *
 * Split out of `useRoutineAppState.ts` as part of the Phase 2
 * decomposition (initiative 0001) so the orchestrator hook stays
 * under the 600-LOC lint guard. Everything here is `useMemo`-based
 * and contains no event listeners or side effects.
 */

import { useMemo } from "react";
import {
  buildHubCalendarEvents,
  countEventsByDate,
  dateKeyFromDate,
  FIZRUK_GROUP_LABEL,
  habitScheduledOnDate,
  parseDateKey,
} from "./lib/hubCalendarAggregate";
import { FINYK_SUB_GROUP_LABEL } from "./lib/finykSubscriptionCalendar";
import { addDays, startOfIsoWeek } from "./lib/weekUtils";
import { completionRateForRange, flexibleMaxActiveStreak } from "./lib/streaks";
import {
  groupEventsForList,
  monthBounds,
  monthGrid,
  todayDate,
  type DateRange,
} from "./RoutineApp.helpers";
import type {
  RoutineCompletionRate,
  RoutineDayProgress,
} from "./context/RoutineCalendarContext";
import type { HubCalendarEvent, RoutineState } from "./lib/types";
import type { TimeState } from "./useRoutineTimeState";

export interface UseRoutineDerivedDataParams {
  routine: RoutineState;
  timeState: TimeState;
  tagFilter: string | null;
  listQuery: string;
  finykCalendarTick: number;
}

export interface RoutineDerivedData {
  range: DateRange;
  events: HubCalendarEvent[];
  filtered: HubCalendarEvent[];
  listEvents: HubCalendarEvent[];
  grouped: Array<[string, HubCalendarEvent[]]>;
  tagChips: string[];
  dayCounts: Map<string, number>;
  monthTitle: string;
  cells: Array<number | null>;
  rangeLabel: string;
  headlineDate: string;
  todayKey: string;
  streakMax: number;
  completionRateVal: RoutineCompletionRate;
  dayProgress: RoutineDayProgress;
  activeHabitsCount: number;
  hasNoHabits: boolean;
  hasListFilter: boolean;
  listIsEmpty: boolean;
  canBulkMark: boolean;
}

function fmtUk(key: string): string {
  return parseDateKey(key).toLocaleDateString("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function useRoutineDerivedData({
  routine,
  timeState,
  tagFilter,
  listQuery,
  finykCalendarTick,
}: UseRoutineDerivedDataParams): RoutineDerivedData {
  const { timeMode, monthCursor, selectedDay } = timeState;

  const range = useMemo<DateRange>(() => {
    const t = todayDate();
    const tk = dateKeyFromDate(t);
    if (timeMode === "today") return { startKey: tk, endKey: tk };
    if (timeMode === "tomorrow") {
      const d = addDays(t, 1);
      const k = dateKeyFromDate(d);
      return { startKey: k, endKey: k };
    }
    if (timeMode === "day") {
      return { startKey: selectedDay, endKey: selectedDay };
    }
    if (timeMode === "week") {
      const anchor = parseDateKey(selectedDay);
      const s = startOfIsoWeek(anchor);
      const e = addDays(s, 6);
      return { startKey: dateKeyFromDate(s), endKey: dateKeyFromDate(e) };
    }
    return monthBounds(monthCursor.y, monthCursor.m);
  }, [timeMode, monthCursor.y, monthCursor.m, selectedDay]);

  const events = useMemo(() => {
    void finykCalendarTick; // Finyk mirror tick without mutating `routine`
    return buildHubCalendarEvents(routine, range, {
      showFizruk: routine.prefs.showFizrukInCalendar !== false,
      showFinykSubs: routine.prefs.showFinykSubscriptionsInCalendar !== false,
    });
  }, [routine, range, finykCalendarTick]);

  const filtered = useMemo(() => {
    let ev: HubCalendarEvent[] = events;
    if (tagFilter) {
      if (tagFilter === "__fizruk") ev = ev.filter((e) => e.fizruk);
      else if (tagFilter === "__finyk_sub") ev = ev.filter((e) => e.finykSub);
      else ev = ev.filter((e) => e.tagLabels.includes(tagFilter));
    }
    const q = listQuery.trim().toLowerCase();
    if (q) {
      ev = ev.filter((e) => {
        const hay =
          `${e.title} ${e.subtitle} ${(e.tagLabels || []).join(" ")} ${e.note || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return ev;
  }, [events, tagFilter, listQuery]);

  // AI-CONTEXT: атрактор №7 анти-слоп-стратегії §3.2 (chip-scroller без
  // стелі). Раніше сет безумовно вливав УСІ `routine.tags` незалежно від
  // видимого періоду — стеля відсутня, і чип для тега без подій у поточному
  // діапазоні все одно рендерився та вів у порожній стан. Тепер чип існує
  // лише для тегів, реально представлених подіями видимого періоду; хвіст
  // (теги поза чипами) покриває поле пошуку в `RoutineCalendarPanel`, яке
  // матчить `tagLabels` так само, як і чипи.
  const tagChips = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const e of events) {
      for (const x of e.tagLabels) {
        if (x !== FIZRUK_GROUP_LABEL && x !== FINYK_SUB_GROUP_LABEL) set.add(x);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, "uk"));
  }, [events]);

  const listEvents = useMemo(() => {
    if (timeMode === "month")
      return filtered.filter((e) => e.date === selectedDay);
    return filtered;
  }, [filtered, timeMode, selectedDay]);

  const grouped = useMemo(() => groupEventsForList(listEvents), [listEvents]);

  const dayCounts = useMemo(() => countEventsByDate(events), [events]);

  const monthTitle = new Date(
    monthCursor.y,
    monthCursor.m,
    1,
  ).toLocaleDateString("uk-UA", {
    month: "long",
    year: "numeric",
  });

  const { cells } = monthGrid(monthCursor.y, monthCursor.m);

  const rangeLabel = useMemo(() => {
    if (timeMode === "today") return "Сьогодні";
    if (timeMode === "tomorrow") return "Завтра";
    if (timeMode === "day") {
      return parseDateKey(selectedDay).toLocaleDateString("uk-UA", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    }
    if (timeMode === "week") return "Цей тиждень";
    return monthTitle;
  }, [timeMode, monthTitle, selectedDay]);

  const headlineDate = useMemo(() => {
    const t0 = todayDate();
    const tk = dateKeyFromDate(t0);
    if (timeMode === "day") return fmtUk(selectedDay);
    if (timeMode === "today") return fmtUk(tk);
    if (timeMode === "tomorrow") return fmtUk(dateKeyFromDate(addDays(t0, 1)));
    // AI-CONTEXT: місяць показує СВІЙ діапазон, як і тиждень. Раніше тут було
    // `fmtUk(selectedDay)`, а `applyMode("month")` ставить `selectedDay` на
    // сьогодні — тож герой у режимі місяця показував рівно сьогоднішню дату і
    // був не відрізнити від режиму «Сьогодні» (репорт власника 2026-08-17).
    // Межі місяця вже лежать у `range` (`monthBounds`), лишалось їх узяти.
    if (timeMode === "week" || timeMode === "month") {
      const a = fmtUk(range.startKey);
      const b = fmtUk(range.endKey);
      return range.startKey === range.endKey ? a : `${a} – ${b}`;
    }
    return fmtUk(tk);
  }, [timeMode, selectedDay, range.startKey, range.endKey]);

  const todayKey = dateKeyFromDate(todayDate());

  // AI-CONTEXT: гнучкий стрік (Хвиля 4, канон §4). Жорсткий `maxActiveStreak`
  // ламався на першому порожньому дні — включно з СЬОГОДНІШНІМ, тож щоранку
  // до першої відмітки герой показував «серія обірвалась». Гнучкий поважає
  // датовані паузи, пропуски з причиною й grace-бюджет. Число рухається
  // вгору — саме тому цей cutover іде разом із бампом METRICS_VERSION.
  const streakMax = useMemo(
    () =>
      flexibleMaxActiveStreak(
        routine.habits,
        routine.completions,
        todayKey,
        routine.skips ?? {},
      ),
    [routine.habits, routine.completions, routine.skips, todayKey],
  );

  // AI-CONTEXT: `pausedFrom: todayKey` — заморозка минулого (ADR-0079 §2).
  // `paused` — недатований булеан, тож без цього параметра пауза, поставлена
  // сьогодні, ретроактивно вимиває звичку з усього діапазону: людина ставить
  // паузу і бачить, як її минулий місяць переписується. Те саме трактування
  // вже діє в heatmap (`freezePausedPast`), тут воно доводить rate до тієї ж
  // семантики.
  const completionRateVal = useMemo(
    () =>
      completionRateForRange(
        routine.habits,
        routine.completions,
        range.startKey,
        range.endKey,
        { pausedFrom: todayKey, skips: routine.skips ?? {} },
      ),
    [
      routine.habits,
      routine.completions,
      routine.skips,
      range.startKey,
      range.endKey,
      todayKey,
    ],
  );

  // Лічильник дня мусить рахувати ТОЙ день, який на екрані.
  //
  // AI-CONTEXT: раніше тут стояв жорсткий `todayKey..todayKey`, тож на
  // вкладці «Завтра» (і на будь-якому обраному дні) герой показував
  // сьогоднішні цифри поруч із завтрашнім заголовком і завтрашнім
  // списком — «0 з 3» під днем, у якому заплановано зовсім інше. Беремо
  // однодневний діапазон, коли він однодневний; для тижня/місяця
  // «прогрес дня» не визначений, тож лишається сьогодні.
  //
  // `pausedFrom: todayKey` не рухаємо: це заморозка минулого (ADR-0079
  // §2), вона привʼязана до «сьогодні», а не до показуваного дня.
  const progressDayKey =
    range.startKey === range.endKey ? range.startKey : todayKey;
  const dayProgress = useMemo(
    () =>
      // `includeOnce` — це лічильник чек-листа, не метрика: список дня
      // разову подію показує, тож і «N з M» мусить (канон §7 п.2).
      completionRateForRange(
        routine.habits,
        routine.completions,
        progressDayKey,
        progressDayKey,
        { pausedFrom: todayKey, skips: routine.skips ?? {}, includeOnce: true },
      ),
    [
      routine.habits,
      routine.completions,
      routine.skips,
      progressDayKey,
      todayKey,
    ],
  );

  const canBulkMark = useMemo(() => {
    if (range.startKey !== range.endKey) return false;
    const dk = range.startKey;
    for (const h of routine.habits) {
      if (h.archived) continue;
      if (!habitScheduledOnDate(h, dk)) continue;
      if (!(routine.completions[h.id] || []).includes(dk)) return true;
    }
    return false;
  }, [range.startKey, range.endKey, routine.habits, routine.completions]);

  const activeHabitsCount = routine.habits.filter((h) => !h.archived).length;
  const hasNoHabits = activeHabitsCount === 0;
  const hasListFilter = Boolean(tagFilter) || listQuery.trim().length > 0;
  const listIsEmpty = grouped.length === 0;

  return {
    range,
    events,
    filtered,
    listEvents,
    grouped,
    tagChips,
    dayCounts,
    monthTitle,
    cells,
    rangeLabel,
    headlineDate,
    todayKey,
    streakMax,
    completionRateVal,
    dayProgress,
    activeHabitsCount,
    hasNoHabits,
    hasListFilter,
    listIsEmpty,
    canBulkMark,
  };
}

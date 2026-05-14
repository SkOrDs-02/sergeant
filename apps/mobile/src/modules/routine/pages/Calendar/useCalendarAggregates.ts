/**
 * Sergeant Routine — Calendar completion-aggregator hook.
 *
 * Collects every read-derived value the mobile Calendar page needs
 * from `routine-domain` into a single memoised hook. Called out
 * explicitly by audit `P2.2b`: keeps the page component a thin
 * orchestrator and lets us unit-test aggregation independently of
 * the React Native renderer.
 *
 * Inputs:
 *  - `routine` slice straight from `useRoutineStore`;
 *  - the current `timeMode`, `selectedDay`, `monthCursor`, and
 *    `todayKey` (all controlled by the page);
 *
 * Outputs include the focused date range, the event list pre- and
 * post-filtering, the grouped sections, per-day dot counts, the
 * streak/completion/day-progress stats, the bulk-mark availability
 * flag and the day-headline string.
 */

import { useMemo } from "react";

import {
  addDays,
  buildHubCalendarEvents,
  completionRateForRange,
  countEventsByDate,
  dateKeyFromDate,
  groupEventsForList,
  habitScheduledOnDate,
  maxActiveStreak,
  monthBounds,
  parseDateKey,
  startOfIsoWeek,
  type HubCalendarEvent,
  type RoutineState,
} from "@sergeant/routine-domain";

import { formatDayHeadline } from "./formatters";
import type { MonthCursor, TimeMode } from "./types";

export interface CalendarAggregatesInput {
  routine: RoutineState;
  timeMode: TimeMode;
  selectedDay: string;
  monthCursor: MonthCursor;
  todayKey: string;
}

export interface CalendarAggregates {
  range: { startKey: string; endKey: string };
  events: HubCalendarEvent[];
  listEvents: HubCalendarEvent[];
  grouped: Array<[string, HubCalendarEvent[]]>;
  dayCounts: Map<string, number>;
  streak: number;
  completionRate: { completed: number; scheduled: number; rate: number };
  dayProgress: { completed: number; scheduled: number; rate: number };
  canBulkMark: boolean;
  focusedDay: string;
  headline: string;
}

export function useCalendarAggregates({
  routine,
  timeMode,
  selectedDay,
  monthCursor,
  todayKey,
}: CalendarAggregatesInput): CalendarAggregates {
  const range = useMemo(() => {
    if (timeMode === "today") {
      return { startKey: todayKey, endKey: todayKey };
    }
    if (timeMode === "week") {
      const anchor = parseDateKey(selectedDay);
      const s = startOfIsoWeek(anchor);
      const e = addDays(s, 6);
      return {
        startKey: dateKeyFromDate(s),
        endKey: dateKeyFromDate(e),
      };
    }
    return monthBounds(monthCursor.y, monthCursor.m);
  }, [timeMode, selectedDay, todayKey, monthCursor]);

  const events = useMemo(
    () =>
      buildHubCalendarEvents(routine, range, {
        showFizruk: routine.prefs.showFizrukInCalendar !== false,
        showFinykSubs: routine.prefs.showFinykSubscriptionsInCalendar !== false,
      }),
    [routine, range],
  );

  const listEvents = useMemo(() => {
    if (timeMode === "month") {
      return events.filter((e) => e.date === selectedDay);
    }
    return events;
  }, [events, timeMode, selectedDay]);

  const grouped = useMemo(() => groupEventsForList(listEvents), [listEvents]);

  const dayCounts = useMemo(() => countEventsByDate(events), [events]);

  const streak = useMemo(
    () => maxActiveStreak(routine.habits, routine.completions, todayKey),
    [routine.habits, routine.completions, todayKey],
  );

  const completionRate = useMemo(
    () =>
      completionRateForRange(
        routine.habits,
        routine.completions,
        range.startKey,
        range.endKey,
      ),
    [routine.habits, routine.completions, range.startKey, range.endKey],
  );

  const dayProgress = useMemo(
    () =>
      completionRateForRange(
        routine.habits,
        routine.completions,
        todayKey,
        todayKey,
      ),
    [routine.habits, routine.completions, todayKey],
  );

  const focusedDay = timeMode === "today" ? todayKey : selectedDay;

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

  const headline = useMemo(() => formatDayHeadline(focusedDay), [focusedDay]);

  return {
    range,
    events,
    listEvents,
    grouped,
    dayCounts,
    streak,
    completionRate,
    dayProgress,
    canBulkMark,
    focusedDay,
    headline,
  };
}

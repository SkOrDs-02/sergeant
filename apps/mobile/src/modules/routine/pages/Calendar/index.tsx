/**
 * Sergeant Routine — Calendar screen (React Native).
 *
 * Mobile port of the Hub-календар from `apps/web/src/modules/routine/`
 * (Phase 5 / PR 2). Works on top of pure `@sergeant/routine-domain`
 * and MMKV-backed `@/lib/storage` (see `../../lib/routineStore`).
 *
 * Decomposed in audit `P2.2b` (2026-05-13). The original single-file
 * module is now a folder: presentational pieces (`DayCell`,
 * `WeekHeader`, `MonthHeader`, `MonthGridView`, `StatsPill`,
 * `EventRow`, `GroupedEventList`, `TimeModeSegmented`) live next to
 * this entry, and the read-derived state (range / events / streak /
 * completion ratios / bulk-mark availability) is collected in
 * {@link useCalendarAggregates}.
 *
 * Scope:
 *  - Time-mode segmented control: «Сьогодні» / «Тиждень» / «Місяць».
 *  - 6×7 month grid with day-dot indicators; tap selects a day.
 *  - Habit list grouped by time-of-day (Ранок / День / Вечір /
 *    Будь-коли). Tap toggles completion via `useRoutineStore`.
 *  - «Зробити все» bulk-mark CTA when range is a single day.
 *  - Stats: max streak, completion rate, day progress counter.
 *
 * Out of scope (separate Phase-5 PRs): habit CRUD (PR 4), heatmap
 * (PR 5), reminders (PR 6), drag-and-drop reorder, search,
 * Fizruk/Finyk events (added with their module ports).
 */

import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { dateKeyFromDate, todayDate } from "@sergeant/routine-domain";

import { useRoutineStore } from "../../lib/routineStore";

import { GroupedEventList } from "./GroupedEventList";
import { MonthGridView } from "./MonthGridView";
import { MonthHeader } from "./MonthHeader";
import { StatsPill } from "./StatsPill";
import { TimeModeSegmented } from "./TimeModeSegmented";
import type { MonthCursor, TimeMode } from "./types";
import { useCalendarAggregates } from "./useCalendarAggregates";

export interface CalendarProps {
  /** Optional root `testID` — children derive stable sub-ids. */
  testID?: string;
}

/**
 * Mobile Calendar page — index route of the Routine tab.
 *
 * Renders: stats pill, mode segmented, month navigation + grid,
 * day headline, habit list grouped by time-of-day, bulk-mark CTA.
 */
export function Calendar({ testID }: CalendarProps = {}) {
  const { routine, toggleHabit, bulkMarkDay } = useRoutineStore();

  const today = useMemo(() => todayDate(), []);
  const todayKey = useMemo(() => dateKeyFromDate(today), [today]);

  const [timeMode, setTimeMode] = useState<TimeMode>("today");
  const [monthCursor, setMonthCursor] = useState<MonthCursor>(() => ({
    y: today.getFullYear(),
    m: today.getMonth(),
  }));
  const [selectedDay, setSelectedDay] = useState<string>(todayKey);

  const {
    range,
    grouped,
    dayCounts,
    streak,
    completionRate,
    dayProgress,
    canBulkMark,
    headline,
  } = useCalendarAggregates({
    routine,
    timeMode,
    selectedDay,
    monthCursor,
    todayKey,
  });

  const shiftMonth = useCallback((delta: number) => {
    setMonthCursor((c) => {
      let m = c.m + delta;
      let y = c.y;
      if (m > 11) {
        m = 0;
        y++;
      } else if (m < 0) {
        m = 11;
        y--;
      }
      return { y, m };
    });
  }, []);

  const goToToday = useCallback(() => {
    const t = todayDate();
    setMonthCursor({ y: t.getFullYear(), m: t.getMonth() });
    setSelectedDay(dateKeyFromDate(t));
    setTimeMode("today");
  }, []);

  const handleBulkMark = useCallback(() => {
    if (!canBulkMark) return;
    bulkMarkDay(range.startKey);
  }, [canBulkMark, bulkMarkDay, range.startKey]);

  return (
    <ScrollView
      testID={testID ? `${testID}-scroll` : "routine-calendar-scroll"}
      className="flex-1 bg-bg dark:bg-bg"
      contentContainerClassName="gap-4 px-4 pt-4 pb-8"
    >
      <View className="gap-1">
        {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift -- Module hero kicker mirroring apps/web/src/modules/routine/RoutineApp.tsx */}
        <Text className="text-2xs font-bold uppercase tracking-widest text-ink-500">
          Hub календар
        </Text>
        <Text className="text-xl font-extrabold text-ink-900 capitalize">
          {headline}
        </Text>
      </View>

      <StatsPill
        streak={streak}
        rate={completionRate}
        dayProgress={dayProgress}
      />

      <TimeModeSegmented value={timeMode} onChange={setTimeMode} />

      {timeMode === "month" ? (
        <View className="gap-2">
          <MonthHeader
            cursor={monthCursor}
            onShift={shiftMonth}
            onToday={goToToday}
          />
          <MonthGridView
            cursor={monthCursor}
            selectedDay={selectedDay}
            todayKey={todayKey}
            dayCounts={dayCounts}
            onSelectDay={setSelectedDay}
          />
        </View>
      ) : null}

      {range.startKey === range.endKey ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canBulkMark }}
          accessibilityLabel="Позначити всі заплановані звички виконаними"
          disabled={!canBulkMark}
          onPress={handleBulkMark}
          className={
            "items-center justify-center rounded-xl border py-3 " +
            (canBulkMark ? "bg-ink-900 border-ink-900" : "bg-panel border-line")
          }
        >
          <Text
            className={
              "text-sm font-bold " +
              (canBulkMark ? "text-cream-50" : "text-ink-500")
            }
          >
            Зробити все
          </Text>
        </Pressable>
      ) : null}

      <GroupedEventList
        grouped={grouped}
        onToggleHabit={toggleHabit}
        testID={testID ? `${testID}-events` : undefined}
      />
    </ScrollView>
  );
}

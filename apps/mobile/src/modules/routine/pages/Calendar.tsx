/**
 * Sergeant Routine — Calendar screen (React Native)
 *
 * Mobile port of the Hub-календар з `apps/web/src/modules/routine/`
 * (Phase 5 / PR 2). Працює поверх чистого `@sergeant/routine-domain`
 * і MMKV через `@/lib/storage` (див. `../lib/routineStore`).
 *
 * Scope:
 *  - Перемикач режимів: «Сьогодні» / «Тиждень» / «Місяць».
 *  - Місячна сітка 6×7 із крапками-індикаторами запланованих подій по
 *    дню, тап — вибір дня (+ перехід у режим «День» локально у view).
 *  - Список звичок на обраний день / тиждень, згрупований за часом
 *    доби (Ранок / День / Вечір / Будь-коли). Тап по картці — toggle
 *    `completions[habitId][dateKey]` (через `applyToggleHabitCompletion`).
 *  - CTA «Зробити все» для одного дня (активний поки щось заплановане
 *    і ще не виконане).
 *  - Статистика: поточна серія (max streak), completion rate за
 *    вибраний діапазон, прогрес дня (виконано / заплановано).
 *
 * Поза scope цього PR (окремі майбутні PR Фази 5):
 *  - редагування / створення / видалення звичок (PR 4);
 *  - heatmap-сторінка (PR 5); нагадування expo-notifications (PR 6);
 *  - drag-and-drop reorder, tag-фільтри, пошук, bottom-sheet деталей;
 *  - події Fizruk-плану / Finyk-підписок (на мобілі додаються разом
 *    із портом тих модулів).
 */

import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableProps,
} from "react-native";

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
  monthGrid,
  parseDateKey,
  startOfIsoWeek,
  todayDate,
  type HubCalendarEvent,
} from "@sergeant/routine-domain";

import { useRoutineStore } from "../lib/routineStore";

type TimeMode = "today" | "week" | "month";

interface MonthCursor {
  y: number;
  m: number;
}

const WEEK_HEADERS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"] as const;

const MONTH_NAMES_UK = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
] as const;

function formatMonthTitle(c: MonthCursor): string {
  return `${MONTH_NAMES_UK[c.m]} ${c.y}`;
}

function formatDayHeadline(dateKey: string): string {
  try {
    return parseDateKey(dateKey).toLocaleDateString("uk-UA", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return dateKey;
  }
}

interface SegmentedProps {
  value: TimeMode;
  onChange: (next: TimeMode) => void;
}

function TimeModeSegmented({ value, onChange }: SegmentedProps) {
  const items: Array<{ id: TimeMode; label: string }> = [
    { id: "today", label: "Сьогодні" },
    { id: "week", label: "Тиждень" },
    { id: "month", label: "Місяць" },
  ];
  return (
    <View className="flex-row rounded-2xl bg-panel border border-line p-1">
      {items.map((it) => {
        const active = value === it.id;
        return (
          <Pressable
            key={it.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={it.label}
            onPress={() => onChange(it.id)}
            className={
              "flex-1 min-h-[40px] items-center justify-center rounded-xl px-3 " +
              (active ? "bg-cream-50" : "bg-transparent")
            }
          >
            <Text
              className={
                "text-sm font-bold " +
                (active ? "text-ink-900" : "text-ink-500")
              }
            >
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface MonthHeaderProps {
  cursor: MonthCursor;
  onShift: (delta: number) => void;
  onToday: () => void;
}

function MonthHeader({ cursor, onShift, onToday }: MonthHeaderProps) {
  return (
    <View className="flex-row items-center gap-2 px-1">
      <NavButton
        accessibilityLabel="Попередній місяць"
        onPress={() => onShift(-1)}
        glyph="‹"
      />
      <View className="flex-1 items-center">
        <Text className="text-base font-bold text-ink-900 capitalize">
          {formatMonthTitle(cursor)}
        </Text>
      </View>
      <NavButton
        accessibilityLabel="Наступний місяць"
        onPress={() => onShift(1)}
        glyph="›"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Перейти на сьогодні"
        onPress={onToday}
        className="ml-1 min-h-[36px] items-center justify-center rounded-xl border border-line bg-cream-50 px-3"
      >
        <Text className="text-xs font-bold text-ink-900">Сьогодні</Text>
      </Pressable>
    </View>
  );
}

function NavButton({
  onPress,
  glyph,
  accessibilityLabel,
}: Pick<PressableProps, "onPress"> & {
  glyph: string;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="h-10 w-10 items-center justify-center rounded-xl border border-line bg-panel"
    >
      <Text className="text-lg font-bold text-ink-700">{glyph}</Text>
    </Pressable>
  );
}

interface MonthGridProps {
  cursor: MonthCursor;
  selectedDay: string;
  todayKey: string;
  dayCounts: Map<string, number>;
  onSelectDay: (dateKey: string) => void;
}

function MonthGridView({
  cursor,
  selectedDay,
  todayKey,
  dayCounts,
  onSelectDay,
}: MonthGridProps) {
  const { cells } = monthGrid(cursor.y, cursor.m);
  return (
    <View className="rounded-2xl border border-line bg-panel p-2">
      <View className="flex-row">
        {WEEK_HEADERS.map((w) => (
          <View key={w} className="flex-1 py-1 items-center">
            <Text className="text-2xs font-semibold text-ink-500">{w}</Text>
          </View>
        ))}
      </View>
      <View className="flex-row flex-wrap">
        {cells.map((d, idx) => {
          if (d === null) {
            return (
              <View
                key={`empty_${idx}`}
                className="w-[14.2857%] aspect-square p-0.5"
              />
            );
          }
          const dk = dateKeyFromDate(new Date(cursor.y, cursor.m, d));
          const count = dayCounts.get(dk) || 0;
          const isToday = dk === todayKey;
          const isSelected = dk === selectedDay;
          return (
            <Pressable
              key={dk}
              accessibilityRole="button"
              accessibilityLabel={`Обрати день ${dk}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelectDay(dk)}
              className="w-[14.2857%] aspect-square p-0.5"
            >
              <View
                className={
                  "flex-1 items-center justify-center rounded-xl border " +
                  (isSelected
                    ? "bg-cream-100 border-ink-900"
                    : isToday
                      ? "bg-cream-50 border-line"
                      : "bg-transparent border-transparent")
                }
              >
                <Text
                  className={
                    "text-sm font-bold " +
                    (isSelected || isToday ? "text-ink-900" : "text-ink-600")
                  }
                >
                  {d}
                </Text>
                {count > 0 ? (
                  <View className="mt-0.5 h-1 w-1 rounded-full bg-ink-500" />
                ) : (
                  <View className="mt-0.5 h-1 w-1 rounded-full bg-transparent" />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

interface StatsPillProps {
  streak: number;
  rate: { completed: number; scheduled: number; rate: number };
  dayProgress: { completed: number; scheduled: number };
}

function StatsPill({ streak, rate, dayProgress }: StatsPillProps) {
  const pct = Math.round(rate.rate * 100);
  return (
    <View className="flex-row gap-2">
      <StatChip label="🔥 Серія" value={`${streak} дн.`} />
      <StatChip
        label="✅ Виконано"
        value={`${rate.completed}/${rate.scheduled} · ${pct}%`}
      />
      <StatChip
        label="📅 День"
        value={`${dayProgress.completed}/${dayProgress.scheduled}`}
      />
    </View>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-xl border border-line bg-panel px-3 py-2">
      <Text
        className="text-2xs font-bold uppercase text-ink-500"
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text className="text-sm font-bold text-ink-900 mt-0.5" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

interface EventRowProps {
  event: HubCalendarEvent;
  onToggle: () => void;
  testID?: string;
}

function EventRow({ event, onToggle, testID }: EventRowProps) {
  const isHabit = event.sourceKind === "habit";
  const completed = !!event.completed;
  return (
    <Pressable
      accessibilityRole={isHabit ? "checkbox" : "text"}
      accessibilityLabel={event.title}
      accessibilityState={isHabit ? { checked: completed } : undefined}
      testID={testID}
      onPress={isHabit ? onToggle : undefined}
      className={
        "flex-row items-center gap-3 rounded-xl border px-3 py-2 " +
        (completed ? "bg-cream-50 border-line" : "bg-panel border-line")
      }
    >
      <View
        testID={testID ? `${testID}-indicator` : undefined}
        className={
          "h-6 w-6 rounded-full border-2 items-center justify-center " +
          (completed
            ? "bg-ink-900 border-ink-900"
            : "bg-transparent border-ink-500")
        }
      >
        {completed ? (
          <Text
            testID={testID ? `${testID}-check` : undefined}
            className="text-xs font-bold text-cream-50"
          >
            ✓
          </Text>
        ) : null}
      </View>
      <View className="flex-1 min-w-0">
        <Text
          className={
            "text-sm font-bold " +
            (completed ? "text-ink-500 line-through" : "text-ink-900")
          }
          numberOfLines={1}
        >
          {event.title}
        </Text>
        {event.subtitle ? (
          <Text className="text-xs text-ink-500" numberOfLines={1}>
            {event.subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

interface GroupedListProps {
  grouped: Array<[string, HubCalendarEvent[]]>;
  onToggleHabit: (habitId: string, dateKey: string) => void;
  testID?: string;
}

function GroupedEventList({
  grouped,
  onToggleHabit,
  testID,
}: GroupedListProps) {
  if (grouped.length === 0) {
    return (
      <View
        testID={testID ? `${testID}-empty` : undefined}
        className="rounded-2xl border border-line bg-panel p-4 items-center"
      >
        <Text className="text-sm text-ink-500">
          Немає подій для цього діапазону.
        </Text>
      </View>
    );
  }
  return (
    <View className="gap-3" testID={testID}>
      {grouped.map(([head, rows]) => (
        <View key={head} className="gap-2">
          <Text className="text-2xs font-bold uppercase text-ink-500">
            {head}
          </Text>
          <View className="gap-2">
            {rows.map((e) => (
              <EventRow
                key={e.id}
                event={e}
                testID={
                  testID && e.habitId
                    ? `${testID}-habit-${e.habitId}`
                    : testID
                      ? `${testID}-event-${e.id}`
                      : undefined
                }
                onToggle={() =>
                  e.habitId ? onToggleHabit(e.habitId, e.date) : undefined
                }
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export interface CalendarProps {
  /** Optional root `testID` — children derive stable sub-ids. */
  testID?: string;
}

/**
 * Mobile Calendar page — index route of the Routine tab.
 *
 * Renders: stats pill, mode segmented, month navigation + grid, day
 * headline, habit list grouped by time-of-day, bulk-mark CTA.
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

  const handleBulkMark = useCallback(() => {
    if (!canBulkMark) return;
    bulkMarkDay(range.startKey);
  }, [canBulkMark, bulkMarkDay, range.startKey]);

  const headline = useMemo(() => formatDayHeadline(focusedDay), [focusedDay]);

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

export default Calendar;

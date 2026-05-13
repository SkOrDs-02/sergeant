/**
 * Sergeant Routine — `useCalendarAggregates` unit tests.
 *
 * Added together with the `Calendar.tsx` decomposition (audit
 * `P2.2b`). Drives the hook directly through `renderHook` so the
 * aggregation logic can be exercised without the full page tree —
 * `useRoutineStore`, MMKV, and the SQLite warm cache are all out
 * of scope here because the hook is pure-input → pure-output.
 */

import { renderHook } from "@testing-library/react-native";

import {
  dateKeyFromDate,
  defaultRoutineState,
  todayDate,
  type Habit,
  type RoutineState,
} from "@sergeant/routine-domain";

import { useCalendarAggregates } from "./useCalendarAggregates";

function seededRoutine(extra: Partial<RoutineState> = {}): RoutineState {
  const base = defaultRoutineState();
  return { ...base, ...extra };
}

function dailyHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "h-water",
    name: "Випити воду",
    emoji: "💧",
    recurrence: "daily",
    tagIds: [],
    categoryId: null,
    archived: false,
    reminderTimes: [],
    ...overrides,
  } as Habit;
}

describe("useCalendarAggregates", () => {
  it("aggregates a single-day range with a scheduled habit (happy path)", () => {
    const today = todayDate();
    const todayKey = dateKeyFromDate(today);
    const routine = seededRoutine({
      habits: [dailyHabit()],
      habitOrder: ["h-water"],
    });

    const { result } = renderHook(() =>
      useCalendarAggregates({
        routine,
        timeMode: "today",
        selectedDay: todayKey,
        monthCursor: { y: today.getFullYear(), m: today.getMonth() },
        todayKey,
      }),
    );

    expect(result.current.range).toEqual({
      startKey: todayKey,
      endKey: todayKey,
    });
    expect(result.current.focusedDay).toBe(todayKey);
    expect(result.current.events.some((e) => e.date === todayKey)).toBe(true);
    // Bulk-mark is available because a daily habit is scheduled today
    // and not yet completed — the single most common Calendar entry
    // state.
    expect(result.current.canBulkMark).toBe(true);
    expect(result.current.dayProgress.scheduled).toBeGreaterThanOrEqual(1);
    expect(result.current.dayProgress.completed).toBe(0);
  });

  it("flips `canBulkMark` off once the only scheduled habit is completed (edge case)", () => {
    const today = todayDate();
    const todayKey = dateKeyFromDate(today);
    const routine = seededRoutine({
      habits: [dailyHabit()],
      habitOrder: ["h-water"],
      // Habit already marked complete for today — bulk-mark CTA must
      // disable itself instead of re-marking a finished day.
      completions: { "h-water": [todayKey] },
    });

    const { result } = renderHook(() =>
      useCalendarAggregates({
        routine,
        timeMode: "today",
        selectedDay: todayKey,
        monthCursor: { y: today.getFullYear(), m: today.getMonth() },
        todayKey,
      }),
    );

    expect(result.current.canBulkMark).toBe(false);
    expect(result.current.dayProgress.completed).toBe(
      result.current.dayProgress.scheduled,
    );
    // Streak reflects the just-completed habit — 1 day of activity.
    expect(result.current.streak).toBeGreaterThanOrEqual(1);
  });

  it("disables `canBulkMark` for a multi-day range and filters events when in month mode", () => {
    // Edge case — month mode focuses on `selectedDay` for the list
    // but spans the whole month for the dot-count map. Bulk-mark
    // is only valid for single-day ranges.
    const today = todayDate();
    const todayKey = dateKeyFromDate(today);
    const routine = seededRoutine({
      habits: [dailyHabit()],
      habitOrder: ["h-water"],
    });

    const { result } = renderHook(() =>
      useCalendarAggregates({
        routine,
        timeMode: "month",
        selectedDay: todayKey,
        monthCursor: { y: today.getFullYear(), m: today.getMonth() },
        todayKey,
      }),
    );

    expect(result.current.range.startKey).not.toBe(result.current.range.endKey);
    expect(result.current.canBulkMark).toBe(false);
    // The list filters to the selected day only.
    expect(result.current.listEvents.every((e) => e.date === todayKey)).toBe(
      true,
    );
    // dayCounts spans the whole month — at least the selected day
    // has a dot from the daily habit.
    expect(result.current.dayCounts.get(todayKey)).toBeGreaterThanOrEqual(1);
  });
});

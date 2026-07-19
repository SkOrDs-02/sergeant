// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { RoutineState, Habit } from "../lib/types";
import { useStreakRecordPendingInsight } from "./useStreakRecordPendingInsight";

vi.mock("@shared/lib/time/kyivTime", () => ({
  getKyivDayKey: vi.fn(),
}));
vi.mock("../lib/streaks", () => ({
  maxActiveStreak: vi.fn(),
  maxStreakAllTime: vi.fn(),
}));

import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { maxActiveStreak, maxStreakAllTime } from "../lib/streaks";

const mockDayKey = vi.mocked(getKyivDayKey);
const mockActive = vi.mocked(maxActiveStreak);
const mockAllTime = vi.mocked(maxStreakAllTime);

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return { id: "h1", name: "Вода", recurrence: "daily", ...overrides };
}

function makeState(habits: Habit[]): RoutineState {
  return {
    schemaVersion: 1,
    prefs: {},
    tags: [],
    categories: [],
    habits,
    completions: {},
    pushupsByDate: {},
    habitOrder: habits.map((h) => h.id),
    completionNotes: {},
  };
}

beforeEach(() => {
  mockDayKey.mockReturnValue("2026-07-19");
});

describe("useStreakRecordPendingInsight", () => {
  it("returns null when there is no historical record yet (longestStreak<=0)", () => {
    mockActive.mockReturnValue(0);
    mockAllTime.mockReturnValue(0);
    const state = makeState([makeHabit()]);
    const { result } = renderHook(() => useStreakRecordPendingInsight(state));
    expect(result.current).toBeNull();
  });

  it("returns null when current streak is not exactly one below the record", () => {
    mockActive.mockReturnValue(3);
    mockAllTime.mockReturnValue(10);
    const state = makeState([makeHabit()]);
    const { result } = renderHook(() => useStreakRecordPendingInsight(state));
    expect(result.current).toBeNull();
  });

  it("returns an insight when current streak is exactly one below the all-time record", () => {
    mockActive.mockReturnValue(6);
    mockAllTime.mockReturnValue(7);
    const state = makeState([makeHabit()]);
    const { result } = renderHook(() => useStreakRecordPendingInsight(state));
    expect(result.current).toEqual({
      id: "routine-streak-record-pending",
      module: "routine",
      title: "Серія: 6 днів",
      subtitle: "Ще один — і рекорд 7",
      action: { type: "navigate", path: "/routine/today" },
      showOn: "both",
    });
  });

  it("skips archived habits when computing the all-time record", () => {
    mockActive.mockReturnValue(2);
    // Two habits: only the non-archived one should feed maxStreakAllTime.
    mockAllTime.mockImplementation((habit) =>
      habit.id === "archived-habit" ? 99 : 3,
    );
    const state = makeState([
      makeHabit({ id: "archived-habit", archived: true }),
      makeHabit({ id: "active-habit" }),
    ]);
    const { result } = renderHook(() => useStreakRecordPendingInsight(state));
    // longestStreak should be 3 (from active-habit), not 99 — so
    // currentStreak=2 === longestStreak-1=2 fires the insight.
    expect(result.current?.subtitle).toBe("Ще один — і рекорд 3");
  });
});

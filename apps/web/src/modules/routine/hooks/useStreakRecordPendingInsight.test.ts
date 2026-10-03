// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { RoutineState, Habit } from "../lib/types";
import { useStreakRecordPendingInsight } from "./useStreakRecordPendingInsight";

vi.mock("../lib/streaks", () => ({
  // Хук перейшов на гнучкий стрік (Хвиля 4) — мок іде за ним.
  flexibleMaxActiveStreak: vi.fn(),
  maxStreakAllTime: vi.fn(),
}));

import { flexibleMaxActiveStreak, maxStreakAllTime } from "../lib/streaks";

const mockActive = vi.mocked(flexibleMaxActiveStreak);
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
    habitOrder: habits.map((h) => h.id),
    completionNotes: {},
  };
}

beforeEach(() => {
  // `todayKey` (`lib/dayAnchor.ts`) is now device-local (ADR-0078) and reads
  // the real system clock here — irrelevant to these assertions since
  // `flexibleMaxActiveStreak`/`maxStreakAllTime` are fully mocked below and
  // ignore the key argument's value.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-19T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useStreakRecordPendingInsight", () => {
  it("returns null when there is no historical record yet (longestStreak<=0)", () => {
    mockActive.mockReturnValue(0);
    mockAllTime.mockReturnValue(0);
    const state = makeState([makeHabit()]);
    const { result } = renderHook(() => useStreakRecordPendingInsight(state));
    expect(result.current).toBeNull();
  });

  it("returns null when there is no live streak (current=0, record=1): «Серія: 0 днів» is never shown", () => {
    // Регресія: `currentStreak === longestStreak - 1` виконується для 0/1, і
    // картка казала «Серія: 0 днів / Ще один, і рекорд 1».
    mockActive.mockReturnValue(0);
    mockAllTime.mockReturnValue(1);
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
      // Ще один день рекорд лише повторює (6 + 1 = 7), а не б'є.
      subtitle: "Ще день, і повториш рекорд 7 днів",
      askAiPrompt:
        "Моя серія зараз 6 днів, а особистий рекорд 7 днів. Ще день, і я його повторю. Дай коротку мотивацію і підкажи, як не зірватись завтра.",
      action: { type: "navigate", path: "/routine/today" },
      showOn: "both",
    });
  });

  it("fires for the smallest live case 1/2 with correct plural forms", () => {
    mockActive.mockReturnValue(1);
    mockAllTime.mockReturnValue(2);
    const state = makeState([makeHabit()]);
    const { result } = renderHook(() => useStreakRecordPendingInsight(state));
    expect(result.current?.title).toBe("Серія: 1 день");
    expect(result.current?.subtitle).toBe("Ще день, і повториш рекорд 2 дні");
  });

  it("fires for 2/3 and the copy never claims to beat the record or prints the current value as the record", () => {
    mockActive.mockReturnValue(2);
    mockAllTime.mockReturnValue(3);
    const state = makeState([makeHabit()]);
    const { result } = renderHook(() => useStreakRecordPendingInsight(state));
    expect(result.current?.title).toBe("Серія: 2 дні");
    expect(result.current?.subtitle).toBe("Ще день, і повториш рекорд 3 дні");
    expect(result.current?.askAiPrompt).toContain("рекорд 3 дні");
    expect(result.current?.askAiPrompt).not.toMatch(/побит/i);
  });

  it("returns null when the streak already equals the record (nothing left to repeat)", () => {
    mockActive.mockReturnValue(7);
    mockAllTime.mockReturnValue(7);
    const state = makeState([makeHabit()]);
    const { result } = renderHook(() => useStreakRecordPendingInsight(state));
    expect(result.current).toBeNull();
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
    expect(result.current?.subtitle).toBe("Ще день, і повториш рекорд 3 дні");
  });
});

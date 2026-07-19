// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { RoutineState, Habit } from "../lib/types";
import { useTodoEveningInsight } from "./useTodoEveningInsight";

vi.mock("@shared/lib/time/kyivTime", () => ({
  getKyivDayKey: vi.fn(),
  getKyivDateParts: vi.fn(),
}));

import { getKyivDayKey, getKyivDateParts } from "@shared/lib/time/kyivTime";
const mockDayKey = vi.mocked(getKyivDayKey);
const mockDateParts = vi.mocked(getKyivDateParts);

const TODAY = "2026-07-19";

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    name: "Вода",
    recurrence: "daily",
    ...overrides,
  };
}

function makeState(
  habits: Habit[],
  completions: RoutineState["completions"] = {},
): RoutineState {
  return {
    schemaVersion: 1,
    prefs: {},
    tags: [],
    categories: [],
    habits,
    completions,
    pushupsByDate: {},
    habitOrder: habits.map((h) => h.id),
    completionNotes: {},
  };
}

beforeEach(() => {
  mockDayKey.mockReturnValue(TODAY);
});

describe("useTodoEveningInsight", () => {
  it("returns null before 20:00 Kyiv even with pending habits", () => {
    mockDateParts.mockReturnValue({ hour: 19 } as ReturnType<
      typeof getKyivDateParts
    >);
    const state = makeState([makeHabit({ id: "a" }), makeHabit({ id: "b" })]);
    const { result } = renderHook(() => useTodoEveningInsight(state));
    expect(result.current).toBeNull();
  });

  it("returns null in the evening when fewer than 2 habits are pending", () => {
    mockDateParts.mockReturnValue({ hour: 21 } as ReturnType<
      typeof getKyivDateParts
    >);
    const state = makeState([makeHabit({ id: "a" })]);
    const { result } = renderHook(() => useTodoEveningInsight(state));
    expect(result.current).toBeNull();
  });

  it("returns an insight with the pending count when 2+ habits are pending in the evening", () => {
    mockDateParts.mockReturnValue({ hour: 21 } as ReturnType<
      typeof getKyivDateParts
    >);
    const state = makeState([
      makeHabit({ id: "a" }),
      makeHabit({ id: "b" }),
      makeHabit({ id: "c" }),
    ]);
    const { result } = renderHook(() => useTodoEveningInsight(state));
    expect(result.current).toEqual({
      id: "routine-todo-evening",
      module: "routine",
      title: "3 звичок чекають",
      subtitle: "Закрити сьогоднішнє?",
      action: { type: "navigate", path: "/routine/today" },
      showOn: "both",
    });
  });

  it("excludes archived habits from the pending count", () => {
    mockDateParts.mockReturnValue({ hour: 21 } as ReturnType<
      typeof getKyivDateParts
    >);
    const state = makeState([
      makeHabit({ id: "a" }),
      makeHabit({ id: "b" }),
      makeHabit({ id: "c", archived: true }),
    ]);
    const { result } = renderHook(() => useTodoEveningInsight(state));
    expect(result.current?.title).toBe("2 звичок чекають");
  });

  it("excludes habits already completed today", () => {
    mockDateParts.mockReturnValue({ hour: 21 } as ReturnType<
      typeof getKyivDateParts
    >);
    const state = makeState(
      [makeHabit({ id: "a" }), makeHabit({ id: "b" }), makeHabit({ id: "c" })],
      { a: [TODAY] },
    );
    const { result } = renderHook(() => useTodoEveningInsight(state));
    expect(result.current?.title).toBe("2 звичок чекають");
  });

  it("excludes habits not scheduled today (e.g. a one-off completed on a different date)", () => {
    mockDateParts.mockReturnValue({ hour: 21 } as ReturnType<
      typeof getKyivDateParts
    >);
    const state = makeState([
      makeHabit({ id: "a", recurrence: "once", startDate: "2026-01-01" }),
      makeHabit({ id: "b" }),
      makeHabit({ id: "c" }),
    ]);
    const { result } = renderHook(() => useTodoEveningInsight(state));
    // "a" is a one-off scheduled for a past date, so only b+c count.
    expect(result.current?.title).toBe("2 звичок чекають");
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { RoutineState, Habit } from "../lib/types";
import { useTodoEveningInsight } from "./useTodoEveningInsight";

/**
 * Cutover 2026-09-01 (LOG-3, ADR-0078): the "after 20:00" threshold reads
 * the device's own clock now, not Kyiv's — so the fixture pins wall-clock
 * time via `vi.setSystemTime` instead of mocking `getKyivDateParts`. Vitest
 * pins `TZ=UTC` (`apps/web/vitest.config.js`), so "device" here is UTC.
 */
const TODAY = "2026-07-19";

function setDeviceHour(hour: number): void {
  vi.setSystemTime(
    new Date(`${TODAY}T${String(hour).padStart(2, "0")}:00:00.000Z`),
  );
}

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
    habitOrder: habits.map((h) => h.id),
    completionNotes: {},
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTodoEveningInsight", () => {
  it("returns null before 20:00 device-local even with pending habits", () => {
    setDeviceHour(19);
    const state = makeState([makeHabit({ id: "a" }), makeHabit({ id: "b" })]);
    const { result } = renderHook(() => useTodoEveningInsight(state));
    expect(result.current).toBeNull();
  });

  it("returns null in the evening when fewer than 2 habits are pending", () => {
    setDeviceHour(21);
    const state = makeState([makeHabit({ id: "a" })]);
    const { result } = renderHook(() => useTodoEveningInsight(state));
    expect(result.current).toBeNull();
  });

  it("returns an insight with the pending count when 2+ habits are pending in the evening", () => {
    setDeviceHour(21);
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
      askAiPrompt:
        "Вечір, а зі звичок сьогодні не відмічені: Вода, Вода, Вода. Допоможи вирішити, що з цього ще реально зробити, а що чесно перенести.",
      action: { type: "navigate", path: "/routine/today" },
      showOn: "both",
    });
  });

  it("excludes archived habits from the pending count", () => {
    setDeviceHour(21);
    const state = makeState([
      makeHabit({ id: "a" }),
      makeHabit({ id: "b" }),
      makeHabit({ id: "c", archived: true }),
    ]);
    const { result } = renderHook(() => useTodoEveningInsight(state));
    expect(result.current?.title).toBe("2 звичок чекають");
  });

  it("excludes habits already completed today", () => {
    setDeviceHour(21);
    const state = makeState(
      [makeHabit({ id: "a" }), makeHabit({ id: "b" }), makeHabit({ id: "c" })],
      { a: [TODAY] },
    );
    const { result } = renderHook(() => useTodoEveningInsight(state));
    expect(result.current?.title).toBe("2 звичок чекають");
  });

  it("excludes habits not scheduled today (e.g. a one-off completed on a different date)", () => {
    setDeviceHour(21);
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

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Insight } from "@shared/lib/insights/types";
import type { RoutineState } from "../lib/types";

const mockRoutineState = vi.fn<() => { routine: RoutineState }>();
const mockTodoInsight = vi.fn<() => Insight | null>();
const mockStreakInsight = vi.fn<() => Insight | null>();

vi.mock("./useRoutineState", () => ({
  useRoutineState: () => mockRoutineState(),
}));
vi.mock("./useTodoEveningInsight", () => ({
  useTodoEveningInsight: () => mockTodoInsight(),
}));
vi.mock("./useStreakRecordPendingInsight", () => ({
  useStreakRecordPendingInsight: () => mockStreakInsight(),
}));

import { useRoutineInsights } from "./useRoutineInsights";

const EMPTY_STATE: RoutineState = {
  schemaVersion: 1,
  prefs: {},
  tags: [],
  categories: [],
  habits: [],
  completions: {},
  pushupsByDate: {},
  habitOrder: [],
  completionNotes: {},
};

const todoInsight: Insight = {
  id: "routine-todo-evening",
  module: "routine",
  title: "todo",
  subtitle: "todo-sub",
  action: { type: "navigate", path: "/routine/today" },
  showOn: "both",
};

const streakInsight: Insight = {
  id: "routine-streak-record-pending",
  module: "routine",
  title: "streak",
  subtitle: "streak-sub",
  action: { type: "navigate", path: "/routine/today" },
  showOn: "both",
};

beforeEach(() => {
  mockRoutineState.mockReturnValue({ routine: EMPTY_STATE });
  mockTodoInsight.mockReturnValue(null);
  mockStreakInsight.mockReturnValue(null);
});

describe("useRoutineInsights", () => {
  it("returns an empty array when neither sub-hook produces an insight", () => {
    const { result } = renderHook(() => useRoutineInsights());
    expect(result.current).toEqual([]);
  });

  it("returns just the todo-evening insight when only that one fires", () => {
    mockTodoInsight.mockReturnValue(todoInsight);
    const { result } = renderHook(() => useRoutineInsights());
    expect(result.current).toEqual([todoInsight]);
  });

  it("returns just the streak insight when only that one fires", () => {
    mockStreakInsight.mockReturnValue(streakInsight);
    const { result } = renderHook(() => useRoutineInsights());
    expect(result.current).toEqual([streakInsight]);
  });

  it("returns todo-evening before streak-record when both fire (priority order)", () => {
    mockTodoInsight.mockReturnValue(todoInsight);
    mockStreakInsight.mockReturnValue(streakInsight);
    const { result } = renderHook(() => useRoutineInsights());
    expect(result.current).toEqual([todoInsight, streakInsight]);
  });

  it("caps the result at MAX_VISIBLE (2), never over-returning", () => {
    mockTodoInsight.mockReturnValue(todoInsight);
    mockStreakInsight.mockReturnValue(streakInsight);
    const { result } = renderHook(() => useRoutineInsights());
    expect(result.current.length).toBeLessThanOrEqual(2);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Insight } from "./types";

const finykMock = vi.fn<() => Insight[]>();
const fizrukMock = vi.fn<() => Insight[]>();
const routineMock = vi.fn<() => Insight[]>();
const nutritionMock = vi.fn<() => Insight[]>();

vi.mock("@finyk/hooks/useFinykInsights", () => ({
  useFinykInsights: () => finykMock(),
}));
vi.mock("@fizruk/hooks/useFizrukInsights", () => ({
  useFizrukInsights: () => fizrukMock(),
}));
vi.mock("@routine/hooks/useRoutineInsights", () => ({
  useRoutineInsights: () => routineMock(),
}));
vi.mock("@nutrition/hooks/useNutritionInsights", () => ({
  useNutritionInsights: () => nutritionMock(),
}));

// Imported after the mocks so useAllInsights picks up the mocked hooks.
const { useAllInsights } = await import("./useAllInsights");

function makeInsight(id: string, showOn: Insight["showOn"]): Insight {
  return {
    id,
    module: null,
    title: id,
    subtitle: id,
    action: { type: "callback", fn: () => {} },
    showOn,
  };
}

describe("useAllInsights", () => {
  beforeEach(() => {
    finykMock.mockReturnValue([]);
    fizrukMock.mockReturnValue([]);
    routineMock.mockReturnValue([]);
    nutritionMock.mockReturnValue([]);
  });

  it("returns an empty array when all module hooks return no insights", () => {
    const { result } = renderHook(() => useAllInsights({ surface: "hub" }));
    expect(result.current).toEqual([]);
  });

  it("aggregates insights from all four modules", () => {
    finykMock.mockReturnValue([
      makeInsight("finyk-recurring-detected", "both"),
    ]);
    fizrukMock.mockReturnValue([
      makeInsight("fizruk-rest-day-overdue", "both"),
    ]);
    routineMock.mockReturnValue([makeInsight("routine-todo-evening", "both")]);
    nutritionMock.mockReturnValue([
      makeInsight("nutrition-protein-low", "both"),
    ]);
    const { result } = renderHook(() =>
      useAllInsights({ surface: "hub", cap: 10 }),
    );
    expect(result.current).toHaveLength(4);
  });

  it("filters out module-only insights on the hub surface", () => {
    finykMock.mockReturnValue([
      makeInsight("finyk-recurring-detected", "module"),
    ]);
    const { result } = renderHook(() => useAllInsights({ surface: "hub" }));
    expect(result.current).toEqual([]);
  });

  it("filters out hub-only insights on the module surface", () => {
    finykMock.mockReturnValue([makeInsight("finyk-recurring-detected", "hub")]);
    const { result } = renderHook(() => useAllInsights({ surface: "module" }));
    expect(result.current).toEqual([]);
  });

  it("keeps 'both' insights on either surface", () => {
    finykMock.mockReturnValue([
      makeInsight("finyk-recurring-detected", "both"),
    ]);
    const hub = renderHook(() => useAllInsights({ surface: "hub" }));
    expect(hub.result.current).toHaveLength(1);
    const mod = renderHook(() => useAllInsights({ surface: "module" }));
    expect(mod.result.current).toHaveLength(1);
  });

  it("sorts by known priority rank (fizruk-pr-pending highest)", () => {
    nutritionMock.mockReturnValue([
      makeInsight("nutrition-streak-7-days-x", "both"),
    ]);
    fizrukMock.mockReturnValue([makeInsight("fizruk-pr-pending", "both")]);
    finykMock.mockReturnValue([
      makeInsight("finyk-coffee-limit-2026-05", "both"),
    ]);
    const { result } = renderHook(() =>
      useAllInsights({ surface: "hub", cap: 10 }),
    );
    expect(result.current.map((i) => i.id)).toEqual([
      "fizruk-pr-pending",
      "nutrition-streak-7-days-x",
      "finyk-coffee-limit-2026-05",
    ]);
  });

  it("falls back unknown ids below all known ranks, preserving declaration order", () => {
    finykMock.mockReturnValue([makeInsight("unknown-a", "both")]);
    fizrukMock.mockReturnValue([makeInsight("unknown-b", "both")]);
    routineMock.mockReturnValue([makeInsight("routine-todo-evening", "both")]);
    const { result } = renderHook(() =>
      useAllInsights({ surface: "hub", cap: 10 }),
    );
    expect(result.current.map((i) => i.id)).toEqual([
      "routine-todo-evening",
      "unknown-a",
      "unknown-b",
    ]);
  });

  it("caps the result to the default of 3", () => {
    nutritionMock.mockReturnValue([
      makeInsight("a", "both"),
      makeInsight("b", "both"),
      makeInsight("c", "both"),
      makeInsight("d", "both"),
    ]);
    const { result } = renderHook(() => useAllInsights({ surface: "hub" }));
    expect(result.current).toHaveLength(3);
  });

  it("respects a custom cap", () => {
    nutritionMock.mockReturnValue([
      makeInsight("a", "both"),
      makeInsight("b", "both"),
    ]);
    const { result } = renderHook(() =>
      useAllInsights({ surface: "hub", cap: 1 }),
    );
    expect(result.current).toHaveLength(1);
  });
});

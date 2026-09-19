// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Rec } from "../../lib/recommendationEngine";
import type { Insight } from "@shared/lib/insights/types";

const generateRecommendationsMock = vi.fn<() => Rec[]>();
vi.mock("../../lib/recommendationEngine", () => ({
  generateRecommendations: () => generateRecommendationsMock(),
}));

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

// Після моків — щоб хук підхопив підмінені джерела.
const { useNowItems } = await import("./useNowItems");
const { HUB_RECS_DISMISSED_KEY } =
  await import("../../insights/TodayFocusCard");

const INSIGHTS_DISMISSED_KEY = "sergeant.v2.insights.dismissed";

function rec(
  id: string,
  priority: number,
  module: Rec["module"] = "nutrition",
): Rec {
  return {
    id,
    module,
    priority,
    icon: "leaf",
    title: id,
    body: "",
    action: module,
  };
}

function insight(id: string, showOn: Insight["showOn"] = "both"): Insight {
  return {
    id,
    module: "nutrition",
    title: id,
    subtitle: id,
    askAiPrompt: `ask ${id}`,
    action: { type: "navigate", path: "/nutrition" },
    showOn,
  };
}

describe("useNowItems", () => {
  beforeEach(() => {
    localStorage.clear();
    generateRecommendationsMock.mockReturnValue([]);
    finykMock.mockReturnValue([]);
    fizrukMock.mockReturnValue([]);
    routineMock.mockReturnValue([]);
    nutritionMock.mockReturnValue([]);
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("зливає обидва джерела в один список без cap джерела інсайтів", () => {
    generateRecommendationsMock.mockReturnValue([
      rec("nutrition_protein_low", 68),
    ]);
    nutritionMock.mockReturnValue([
      insight("nutrition-protein-low"),
      insight("nutrition-streak-7-days-2026-W38"),
      insight("nutrition-a"),
      insight("nutrition-b"),
      insight("nutrition-c"),
    ]);

    const { result } = renderHook(() => useNowItems());

    // 1 близнюк + 4 окремі інсайти = 5, тобто більше за DEFAULT_CAP=3
    // `useAllInsights` — cap джерела знято.
    expect(result.current.items.map((i) => i.id)).toEqual([
      "nutrition_protein_low",
      "nutrition-streak-7-days-2026-W38",
      "nutrition-a",
      "nutrition-b",
      "nutrition-c",
    ]);
  });

  it("поважає поверхню: інсайти лише для модуля на хаб не потрапляють", () => {
    nutritionMock.mockReturnValue([
      insight("nutrition-module-only", "module"),
      insight("nutrition-hub-only", "hub"),
    ]);
    const { result } = renderHook(() => useNowItems());
    expect(result.current.items.map((i) => i.id)).toEqual([
      "nutrition-hub-only",
    ]);
  });

  it("dismiss близнюка пише ОБИДВА сховища і ховає рядок негайно", () => {
    generateRecommendationsMock.mockReturnValue([
      rec("nutrition_protein_low", 68),
    ]);
    nutritionMock.mockReturnValue([insight("nutrition-protein-low")]);

    const { result } = renderHook(() => useNowItems());
    expect(result.current.items).toHaveLength(1);

    act(() => result.current.dismiss(result.current.items[0]!));

    expect(result.current.items).toEqual([]);
    const recs = JSON.parse(
      localStorage.getItem(HUB_RECS_DISMISSED_KEY) ?? "{}",
    );
    expect(Object.keys(recs)).toEqual(["nutrition_protein_low"]);
    expect(
      JSON.parse(localStorage.getItem(INSIGHTS_DISMISSED_KEY) ?? "[]"),
    ).toEqual(["nutrition-protein-low"]);
  });

  it("рядок, відкинутий раніше за БУДЬ-ЯКИМ із двох id, не повертається", () => {
    generateRecommendationsMock.mockReturnValue([
      rec("nutrition_protein_low", 68),
      rec("routine_evening_reminder", 65, "routine"),
    ]);
    nutritionMock.mockReturnValue([insight("nutrition-protein-low")]);
    routineMock.mockReturnValue([insight("routine-todo-evening")]);

    // Перший близнюк відкинуто в модулі (сховище інсайтів), другий — на
    // старому hero (сховище рекомендацій).
    localStorage.setItem(
      INSIGHTS_DISMISSED_KEY,
      JSON.stringify(["nutrition-protein-low"]),
    );
    localStorage.setItem(
      HUB_RECS_DISMISSED_KEY,
      JSON.stringify({ routine_evening_reminder: 1 }),
    );

    const { result } = renderHook(() => useNowItems());
    expect(result.current.items).toEqual([]);
  });

  it("dismiss рядка без Rec-походження не чіпає сховище рекомендацій", () => {
    nutritionMock.mockReturnValue([
      insight("nutrition-streak-7-days-2026-W38"),
    ]);
    const { result } = renderHook(() => useNowItems());

    act(() => result.current.dismiss(result.current.items[0]!));

    expect(localStorage.getItem(HUB_RECS_DISMISSED_KEY)).toBeNull();
    expect(
      JSON.parse(localStorage.getItem(INSIGHTS_DISMISSED_KEY) ?? "[]"),
    ).toEqual(["nutrition-streak-7-days-2026-W38"]);
  });
});

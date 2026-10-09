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
      Object.keys(
        JSON.parse(localStorage.getItem(INSIGHTS_DISMISSED_KEY) ?? "{}"),
      ),
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
      JSON.stringify({ "nutrition-protein-low": Date.now() }),
    );
    localStorage.setItem(
      HUB_RECS_DISMISSED_KEY,
      JSON.stringify({ routine_evening_reminder: Date.now() }),
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
      Object.keys(
        JSON.parse(localStorage.getItem(INSIGHTS_DISMISSED_KEY) ?? "{}"),
      ),
    ).toEqual(["nutrition-streak-7-days-2026-W38"]);
  });

  describe("«✕» діє до кінця поточної доби (рішення власника 2026-10-01)", () => {
    // Локальні компоненти: межа доби — годинник пристрою (ADR-0078).
    const NOON = new Date(2026, 9, 1, 12, 0, 0);
    const YESTERDAY = new Date(2026, 8, 30, 21, 0, 0).getTime();

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOON);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("відкинуте вчора рекомендація повертається: статичний id правила не глушиться навіки", () => {
      generateRecommendationsMock.mockReturnValue([
        rec("fizruk_long_break", 80, "fizruk"),
      ]);
      localStorage.setItem(
        HUB_RECS_DISMISSED_KEY,
        JSON.stringify({ fizruk_long_break: YESTERDAY }),
      );

      const { result } = renderHook(() => useNowItems());

      expect(result.current.items.map((i) => i.id)).toEqual([
        "fizruk_long_break",
      ]);
      expect(result.current.postponed).toBe(0);
    });

    it("відкинутий вчора інсайт повертається так само", () => {
      nutritionMock.mockReturnValue([insight("nutrition-protein-low")]);
      localStorage.setItem(
        INSIGHTS_DISMISSED_KEY,
        JSON.stringify({ "nutrition-protein-low": YESTERDAY }),
      );

      const { result } = renderHook(() => useNowItems());

      expect(result.current.items.map((i) => i.id)).toEqual([
        "nutrition-protein-low",
      ]);
    });

    it("застарілі «назавжди»-записи (мапа з `1`, масив id) вважаються простроченими", () => {
      generateRecommendationsMock.mockReturnValue([
        rec("fizruk_long_break", 80, "fizruk"),
      ]);
      nutritionMock.mockReturnValue([insight("nutrition-protein-low")]);
      localStorage.setItem(
        HUB_RECS_DISMISSED_KEY,
        JSON.stringify({ fizruk_long_break: 1 }),
      );
      localStorage.setItem(
        INSIGHTS_DISMISSED_KEY,
        JSON.stringify(["nutrition-protein-low"]),
      );

      const { result } = renderHook(() => useNowItems());

      expect(result.current.items.map((i) => i.id).sort()).toEqual([
        "fizruk_long_break",
        "nutrition-protein-low",
      ]);
    });

    it("відкинуте сьогодні лишається схованим до півночі, а тоді повертається без перезавантаження", () => {
      generateRecommendationsMock.mockReturnValue([
        rec("fizruk_long_break", 80, "fizruk"),
      ]);
      const { result, rerender } = renderHook(() => useNowItems());
      act(() => result.current.dismiss(result.current.items[0]!));
      expect(result.current.items).toEqual([]);

      vi.setSystemTime(new Date(2026, 9, 1, 23, 58, 0));
      rerender();
      expect(result.current.items).toEqual([]);

      vi.setSystemTime(new Date(2026, 9, 2, 0, 2, 0));
      rerender();
      expect(result.current.items.map((i) => i.id)).toEqual([
        "fizruk_long_break",
      ]);
      expect(result.current.postponed).toBe(0);
    });

    it("postponed рахує відкладені сьогодні рядки; restorePostponed повертає їх з обох сховищ", () => {
      generateRecommendationsMock.mockReturnValue([
        rec("nutrition_protein_low", 68),
        rec("fizruk_long_break", 80, "fizruk"),
      ]);
      // Близнюк (rec + insight) і окремий рядок: два рядки, три id.
      nutritionMock.mockReturnValue([insight("nutrition-protein-low")]);

      const { result } = renderHook(() => useNowItems());
      expect(result.current.items).toHaveLength(2);
      expect(result.current.postponed).toBe(0);

      act(() => {
        for (const item of result.current.items) result.current.dismiss(item);
      });
      expect(result.current.items).toEqual([]);
      expect(result.current.postponed).toBe(2);

      act(() => result.current.restorePostponed());

      expect(result.current.items.map((i) => i.id).sort()).toEqual([
        "fizruk_long_break",
        "nutrition_protein_low",
      ]);
      expect(result.current.postponed).toBe(0);
      // Обидва сховища очищені від id повернутих рядків.
      expect(
        JSON.parse(localStorage.getItem(HUB_RECS_DISMISSED_KEY) ?? "{}"),
      ).toEqual({});
      expect(
        JSON.parse(localStorage.getItem(INSIGHTS_DISMISSED_KEY) ?? "{}"),
      ).toEqual({});
    });

    it("restorePostponed не чіпає відкидання, якого цей список не бачить", () => {
      generateRecommendationsMock.mockReturnValue([
        rec("fizruk_long_break", 80, "fizruk"),
      ]);
      // Рядок іншого правила, якого зараз немає в списку, але відкинутого сьогодні.
      localStorage.setItem(
        HUB_RECS_DISMISSED_KEY,
        JSON.stringify({ other_rule: NOON.getTime() }),
      );
      const { result } = renderHook(() => useNowItems());
      act(() => result.current.dismiss(result.current.items[0]!));

      act(() => result.current.restorePostponed());

      expect(
        Object.keys(
          JSON.parse(localStorage.getItem(HUB_RECS_DISMISSED_KEY) ?? "{}"),
        ),
      ).toEqual(["other_rule"]);
    });
  });

  // f3: «Звіт тижня» як ціль працює, лише коли блок «Порада й тиждень»
  // є на екрані. Вимкнений у налаштуваннях, він не слухає подію, і «Відкрити»
  // мовчки нічого б не робило, тож рядок повертається до переходу в модуль.
  describe("ціль «Звіт тижня» і налаштування showInsights", () => {
    const weekRec = (): Rec => ({
      ...rec("spending_velocity_high", 75, "finyk"),
      action: "week_report",
    });

    it("блок увімкнено (за замовчуванням): дія — звіт тижня", () => {
      generateRecommendationsMock.mockReturnValue([weekRec()]);
      const { result } = renderHook(() => useNowItems());
      expect(result.current.items[0]?.action).toEqual({
        kind: "open_week_report",
      });
    });

    it("блок вимкнено: дія повертається в огляд Фініка", async () => {
      const { writeHubPrefsBag } = await import("../../settings/hubPrefs");
      writeHubPrefsBag({ showInsights: false });
      generateRecommendationsMock.mockReturnValue([weekRec()]);
      const { result } = renderHook(() => useNowItems());
      expect(result.current.items[0]?.action).toEqual({
        kind: "open_module",
        module: "finyk",
      });
    });
  });
});

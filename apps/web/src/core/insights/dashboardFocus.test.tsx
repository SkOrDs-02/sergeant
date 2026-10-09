// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useDashboardFocus } from "./dashboardFocus";
import { renderHook, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the recommendation engine so we control what recs are returned
const generateRecommendationsMock = vi.fn<
  () => Array<{
    id: string;
    module: string;
    priority: number;
    severity?: string;
    icon: string;
    title: string;
    body: string;
    action: string;
    pwaAction?: string;
  }>
>(() => []);

vi.mock("../lib/recommendationEngine", () => ({
  generateRecommendations: (...args: unknown[]) =>
    generateRecommendationsMock(...(args as [])),
}));

describe("useDashboardFocus", () => {
  beforeEach(() => {
    localStorage.clear();
    generateRecommendationsMock.mockReturnValue([]);
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("повертає focus=null та rest=[] при порожніх рекомендаціях", () => {
    generateRecommendationsMock.mockReturnValue([]);

    const { result } = renderHook(() => useDashboardFocus());

    expect(result.current.focus).toBeNull();
    expect(result.current.rest).toEqual([]);
  });

  it("повертає найвищий priority рекомендацію як focus", () => {
    generateRecommendationsMock.mockReturnValue([
      {
        id: "r1",
        module: "finyk",
        priority: 90,
        icon: "💸",
        title: "High priority",
        body: "body",
        action: "finyk",
      },
      {
        id: "r2",
        module: "fizruk",
        priority: 50,
        icon: "🏋️",
        title: "Low priority",
        body: "body",
        action: "fizruk",
      },
    ]);

    const { result } = renderHook(() => useDashboardFocus());

    expect(result.current.focus?.id).toBe("r1");
    expect(result.current.rest).toHaveLength(1);
    expect(result.current.rest[0]!.id).toBe("r2");
  });

  it("dismiss приховує рекомендацію", () => {
    generateRecommendationsMock.mockReturnValue([
      {
        id: "r1",
        module: "finyk",
        priority: 90,
        icon: "💸",
        title: "Rec 1",
        body: "body",
        action: "finyk",
      },
      {
        id: "r2",
        module: "fizruk",
        priority: 50,
        icon: "🏋️",
        title: "Rec 2",
        body: "body",
        action: "fizruk",
      },
    ]);

    const { result } = renderHook(() => useDashboardFocus());

    expect(result.current.focus?.id).toBe("r1");

    act(() => {
      result.current.dismiss("r1");
    });

    // After dismiss, r2 becomes focus
    expect(result.current.focus?.id).toBe("r2");
    expect(result.current.rest).toHaveLength(0);
  });

  it("dismiss зберігає стан у localStorage", () => {
    generateRecommendationsMock.mockReturnValue([
      {
        id: "r1",
        module: "finyk",
        priority: 90,
        icon: "💸",
        title: "Rec 1",
        body: "body",
        action: "finyk",
      },
    ]);

    const { result } = renderHook(() => useDashboardFocus());

    act(() => {
      result.current.dismiss("r1");
    });

    const stored = JSON.parse(
      localStorage.getItem("hub_recs_dismissed_v1") || "{}",
    );
    expect(stored["r1"]).toBeDefined();
    expect(typeof stored["r1"]).toBe("number");
  });

  it("dismissed рекомендації не зʼявляються повторно", () => {
    // Pre-set dismissed state
    localStorage.setItem(
      "hub_recs_dismissed_v1",
      JSON.stringify({ r1: Date.now() }),
    );

    generateRecommendationsMock.mockReturnValue([
      {
        id: "r1",
        module: "finyk",
        priority: 90,
        icon: "💸",
        title: "Should be hidden",
        body: "body",
        action: "finyk",
      },
      {
        id: "r2",
        module: "fizruk",
        priority: 50,
        icon: "🏋️",
        title: "Visible",
        body: "body",
        action: "fizruk",
      },
    ]);

    const { result } = renderHook(() => useDashboardFocus());

    expect(result.current.focus?.id).toBe("r2");
    expect(result.current.rest).toHaveLength(0);
  });

  describe("«✕» діє до кінця доби, а не назавжди (рішення власника 2026-10-01)", () => {
    const rec = (id: string, priority: number) => ({
      id,
      module: "fizruk",
      priority,
      icon: "🏋️",
      title: id,
      body: "body",
      action: "fizruk",
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("відкинуте вчора повертається: статичний id правила не глушиться навіки", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 1, 9, 0, 0));
      localStorage.setItem(
        "hub_recs_dismissed_v1",
        JSON.stringify({
          fizruk_long_break: new Date(2026, 8, 30, 21, 0, 0).getTime(),
        }),
      );
      generateRecommendationsMock.mockReturnValue([
        rec("fizruk_long_break", 80),
      ]);

      const { result } = renderHook(() => useDashboardFocus());

      expect(result.current.focus?.id).toBe("fizruk_long_break");
    });

    it("відкинуте сьогодні лишається схованим до півночі, потім повертається", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 1, 9, 0, 0));
      generateRecommendationsMock.mockReturnValue([
        rec("fizruk_long_break", 80),
      ]);

      const { result, rerender } = renderHook(() => useDashboardFocus());
      act(() => {
        result.current.dismiss("fizruk_long_break");
      });
      expect(result.current.focus).toBeNull();

      // Пізно ввечері тієї ж доби — досі схована.
      vi.setSystemTime(new Date(2026, 9, 1, 23, 59, 0));
      rerender();
      expect(result.current.focus).toBeNull();

      // Північ за годинником пристрою — повернулась, перезавантаження не потрібне.
      vi.setSystemTime(new Date(2026, 9, 2, 0, 1, 0));
      rerender();
      expect(result.current.focus?.id).toBe("fizruk_long_break");
    });

    it("застарілі записи без мітки часу (`true`, `1`) вважаються простроченими", () => {
      localStorage.setItem(
        "hub_recs_dismissed_v1",
        JSON.stringify({ legacy_true: true, legacy_one: 1 }),
      );
      generateRecommendationsMock.mockReturnValue([
        rec("legacy_true", 90),
        rec("legacy_one", 80),
      ]);

      const { result } = renderHook(() => useDashboardFocus());

      expect(result.current.focus?.id).toBe("legacy_true");
      expect(result.current.rest.map((r) => r.id)).toEqual(["legacy_one"]);
    });

    it("dismiss прибирає з мапи прострочені id", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 1, 9, 0, 0));
      localStorage.setItem(
        "hub_recs_dismissed_v1",
        JSON.stringify({
          stale: 1,
          yesterday: new Date(2026, 8, 30).getTime(),
        }),
      );
      generateRecommendationsMock.mockReturnValue([rec("fresh", 80)]);

      const { result } = renderHook(() => useDashboardFocus());
      act(() => {
        result.current.dismiss("fresh");
      });

      expect(
        Object.keys(
          JSON.parse(localStorage.getItem("hub_recs_dismissed_v1") || "{}"),
        ),
      ).toEqual(["fresh"]);
    });
  });
});

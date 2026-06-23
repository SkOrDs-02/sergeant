// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the `useNutritionFirstRun` routing/banner-latch hook.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useModuleFirstRun = vi.fn();
vi.mock("../../../core/onboarding/useModuleFirstRun", () => ({
  useModuleFirstRun: (...a: unknown[]) => useModuleFirstRun(...a),
}));

import { useNutritionFirstRun } from "./useNutritionFirstRun";

type Params = Parameters<typeof useNutritionFirstRun>[0];

function makeParams(overrides: Partial<Params> = {}): Params {
  return {
    activePage: "start",
    menuSubTab: "plan",
    pwaAction: undefined,
    setActivePageAndHash: vi.fn(),
    setMenuSubTab: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  useModuleFirstRun.mockReturnValue({ firstRun: false, markSeen: vi.fn() });
});

afterEach(() => vi.clearAllMocks());

describe("useNutritionFirstRun", () => {
  it("does not route when it is not the first run", () => {
    const params = makeParams();
    renderHook(() => useNutritionFirstRun(params));
    expect(params.setActivePageAndHash).not.toHaveBeenCalled();
    expect(params.setMenuSubTab).not.toHaveBeenCalled();
  });

  it("routes a first-run user to menu/plan", () => {
    useModuleFirstRun.mockReturnValue({ firstRun: true, markSeen: vi.fn() });
    const params = makeParams({ activePage: "start", menuSubTab: "recipes" });
    renderHook(() => useNutritionFirstRun(params));
    expect(params.setActivePageAndHash).toHaveBeenCalledWith("menu");
    expect(params.setMenuSubTab).toHaveBeenCalledWith("plan");
  });

  it("skips routing when a pwaAction already controls navigation", () => {
    useModuleFirstRun.mockReturnValue({ firstRun: true, markSeen: vi.fn() });
    const params = makeParams({ pwaAction: "add_meal" });
    renderHook(() => useNutritionFirstRun(params));
    expect(params.setActivePageAndHash).not.toHaveBeenCalled();
  });

  it("marks the first-run surface active on menu/plan", () => {
    useModuleFirstRun.mockReturnValue({ firstRun: true, markSeen: vi.fn() });
    const params = makeParams({ activePage: "menu", menuSubTab: "plan" });
    const { result } = renderHook(() => useNutritionFirstRun(params));
    expect(result.current.firstRunNutritionActive).toBe(true);
  });

  it("exposes markNutritionSeen and a surface setter", () => {
    const markSeen = vi.fn();
    useModuleFirstRun.mockReturnValue({ firstRun: false, markSeen });
    const { result } = renderHook(() => useNutritionFirstRun(makeParams()));
    result.current.markNutritionSeen();
    expect(markSeen).toHaveBeenCalled();
    expect(typeof result.current.setFirstRunNutritionSurface).toBe("function");
  });
});

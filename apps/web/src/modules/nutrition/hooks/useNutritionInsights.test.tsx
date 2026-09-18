// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the `useNutritionInsights` aggregation wrapper.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCached = vi.fn();
vi.mock("../lib/sqliteReader", () => ({
  getCachedNutritionSqliteState: () => getCached(),
}));
vi.mock("../lib/sqliteReadGate", () => ({
  useNutritionSqliteReadTick: () => 0,
}));

const proteinInsight = vi.fn();
const streakInsight = vi.fn();
vi.mock("./useProteinLowInsight", () => ({
  useProteinLowInsight: () => proteinInsight(),
}));
vi.mock("./useStreakSevenDaysInsight", () => ({
  useStreakSevenDaysInsight: () => streakInsight(),
}));

import { useNutritionInsights } from "./useNutritionInsights";

beforeEach(() => {
  getCached.mockReturnValue({ log: {}, prefs: null });
  proteinInsight.mockReturnValue(null);
  streakInsight.mockReturnValue(null);
});

afterEach(() => vi.clearAllMocks());

describe("useNutritionInsights", () => {
  it("returns an empty array when no detector fires", () => {
    const { result } = renderHook(() => useNutritionInsights());
    expect(result.current).toEqual([]);
  });

  it("returns both insights in priority order", () => {
    proteinInsight.mockReturnValue({ id: "protein" });
    streakInsight.mockReturnValue({ id: "streak" });
    const { result } = renderHook(() => useNutritionInsights());
    expect(result.current.map((i) => i.id)).toEqual(["protein", "streak"]);
  });

  it("filters out null detectors", () => {
    streakInsight.mockReturnValue({ id: "streak" });
    const { result } = renderHook(() => useNutritionInsights());
    expect(result.current.map((i) => i.id)).toEqual(["streak"]);
  });
});

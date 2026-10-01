// @vitest-environment jsdom
/**
 * Last validated: 2026-10-01
 * Status: Active
 * Unit tests for `useSavedRecipes` (збережені рецепти для вибору в списку покупок).
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listSavedRecipes } = vi.hoisted(() => ({
  listSavedRecipes: vi.fn(),
}));

vi.mock("../lib/recipeBook", () => ({ listSavedRecipes }));
vi.mock("../lib/sqliteReader", () => ({
  getCachedNutritionSqliteState: () => ({
    recipes: [],
    refreshedAt: null,
  }),
}));

import { __resetNutritionSqliteReadGateForTests } from "../lib/sqliteReadGate";
import { useSavedRecipes } from "./useSavedRecipes";

beforeEach(() => {
  listSavedRecipes.mockReset();
  __resetNutritionSqliteReadGateForTests();
});
afterEach(() => vi.clearAllMocks());

describe("useSavedRecipes", () => {
  it("не торкається книги, поки не ввімкнено", () => {
    const { result } = renderHook(() => useSavedRecipes(false));
    expect(listSavedRecipes).not.toHaveBeenCalled();
    expect(result.current).toEqual({ saved: [], busy: false, error: false });
  });

  it("читає книгу, коли ввімкнено, і знімає busy", async () => {
    listSavedRecipes.mockResolvedValue([{ id: "s1", title: "Борщ" }]);
    const { result } = renderHook(() => useSavedRecipes(true));
    expect(result.current.busy).toBe(true);
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(listSavedRecipes).toHaveBeenCalledWith(200);
    expect(result.current.saved).toEqual([{ id: "s1", title: "Борщ" }]);
    expect(result.current.error).toBe(false);
  });

  it("читає книгу, коли вкладку відкрили пізніше (false → true)", async () => {
    listSavedRecipes.mockResolvedValue([{ id: "s1", title: "Борщ" }]);
    const { result, rerender } = renderHook(
      ({ on }: { on: boolean }) => useSavedRecipes(on),
      { initialProps: { on: false } },
    );
    expect(listSavedRecipes).not.toHaveBeenCalled();
    rerender({ on: true });
    await waitFor(() => expect(result.current.saved).toHaveLength(1));
    expect(result.current.busy).toBe(false);
  });

  it("збій читання не маскується під «рецептів немає»: error = true", async () => {
    listSavedRecipes.mockRejectedValue(new Error("idb"));
    const { result } = renderHook(() => useSavedRecipes(true));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.saved).toEqual([]);
  });
});

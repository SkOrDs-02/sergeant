// @vitest-environment jsdom
/**
 * Last validated: 2026-06-24
 * Status: Active
 * Unit tests for the recipe-cache hydration effect.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/recipeCache", () => ({
  readRecipeCache: vi.fn(),
}));

import { useNutritionRecipeCache } from "./useNutritionRecipeCache";
import { readRecipeCache } from "../lib/recipeCache";
import type { NutritionPage, MenuSubTab } from "../lib/nutritionRouter";

const readMock = readRecipeCache as unknown as ReturnType<typeof vi.fn>;

function renderCache(
  activePage: NutritionPage,
  menuSubTab: MenuSubTab,
  setters = {
    setRecipes: vi.fn(),
    setRecipesRaw: vi.fn(),
    setRecipesTried: vi.fn(),
  },
) {
  renderHook(() =>
    useNutritionRecipeCache({
      activePage,
      menuSubTab,
      recipeCacheKey: "k1",
      ...setters,
    }),
  );
  return setters;
}

beforeEach(() => readMock.mockReset());
afterEach(() => vi.clearAllMocks());

describe("useNutritionRecipeCache", () => {
  it("does not touch the cache outside the menu/recipes tab", () => {
    renderCache("today" as NutritionPage, "recipes" as MenuSubTab);
    expect(readMock).not.toHaveBeenCalled();
  });

  it("does not touch the cache on a non-recipes menu sub-tab", () => {
    renderCache("menu" as NutritionPage, "plan" as MenuSubTab);
    expect(readMock).not.toHaveBeenCalled();
  });

  it("ignores an empty cache", () => {
    readMock.mockReturnValue({ recipes: [], recipesRaw: "" });
    const setters = renderCache(
      "menu" as NutritionPage,
      "recipes" as MenuSubTab,
    );
    expect(readMock).toHaveBeenCalledWith("k1");
    expect(setters.setRecipes).not.toHaveBeenCalled();
  });

  it("hydrates recipes, keeping an explicit id and synthesising a missing one", () => {
    readMock.mockReturnValue({
      recipes: [{ id: 7, title: "Борщ" }, { title: "Без id" }],
      recipesRaw: "RAW",
    });
    const setters = renderCache(
      "menu" as NutritionPage,
      "recipes" as MenuSubTab,
    );
    expect(setters.setRecipes).toHaveBeenCalledTimes(1);
    const next = setters.setRecipes.mock.calls[0]![0] as Array<{ id: string }>;
    expect(next[0]!.id).toBe("7");
    // missing id gets a non-empty stable id
    expect(typeof next[1]!.id).toBe("string");
    expect(next[1]!.id.length).toBeGreaterThan(0);
    expect(setters.setRecipesRaw).toHaveBeenCalledWith("RAW");
    expect(setters.setRecipesTried).toHaveBeenCalledWith(true);
  });
});

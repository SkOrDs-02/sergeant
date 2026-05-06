const mockSafeReadLS = jest.fn();
const mockSafeWriteLS = jest.fn();
jest.mock("@/lib/storage", () => ({
  safeReadLS: (...args: unknown[]) => mockSafeReadLS(...args),
  safeWriteLS: (...args: unknown[]) => mockSafeWriteLS(...args),
}));

import { STORAGE_KEYS } from "@sergeant/shared";

import {
  getRecipeById,
  importRecipesFromJson,
  loadSavedRecipes,
  normalizeSavedRecipe,
  removeSavedRecipe,
  upsertSavedRecipe,
} from "../recipeBookStore";

beforeEach(() => {
  mockSafeReadLS.mockReset().mockReturnValue(null);
  mockSafeWriteLS.mockReset().mockReturnValue(true);
});

describe("recipeBookStore", () => {
  it("normalizeSavedRecipe maps partial objects", () => {
    const r = normalizeSavedRecipe({ id: "a1", title: "Суп" });
    expect(r.id).toBe("a1");
    expect(r.title).toBe("Суп");
    expect(r.ingredients).toEqual([]);
  });

  it("loadSavedRecipes reads { recipes: [] } and legacy array", () => {
    mockSafeReadLS.mockReturnValue({
      recipes: [
        { id: "r1", title: "A", updatedAt: 2 },
        { id: "r2", title: "B", updatedAt: 5 },
      ],
    });
    const a = loadSavedRecipes();
    expect(a[0]?.id).toBe("r2");
    expect(a[1]?.id).toBe("r1");

    mockSafeReadLS.mockReturnValue([{ id: "x", title: "X", updatedAt: 1 }]);
    const b = loadSavedRecipes();
    expect(b[0]?.id).toBe("x");
  });

  it("getRecipeById finds by id", () => {
    mockSafeReadLS.mockReturnValue({
      recipes: [{ id: "q", title: "Q", updatedAt: 1 }],
    });
    expect(getRecipeById("q")?.title).toBe("Q");
    expect(getRecipeById("missing")).toBeUndefined();
  });

  it("upsertSavedRecipe writes to MMKV under the saved-recipes key", () => {
    mockSafeReadLS.mockReturnValue({ recipes: [] });
    upsertSavedRecipe({ id: "n1", title: "New" });
    expect(mockSafeWriteLS).toHaveBeenCalled();
    const call = mockSafeWriteLS.mock.calls.find(
      (c) => c[0] === STORAGE_KEYS.NUTRITION_SAVED_RECIPES,
    );
    expect(call).toBeTruthy();
  });

  it("removeSavedRecipe drops one entry", () => {
    mockSafeReadLS.mockReturnValue({
      recipes: [
        { id: "a", title: "A", updatedAt: 1 },
        { id: "b", title: "B", updatedAt: 2 },
      ],
    });
    const ok = removeSavedRecipe("a");
    expect(ok).toBe(true);
    const written = mockSafeWriteLS.mock.calls.find(
      (c) => c[0] === STORAGE_KEYS.NUTRITION_SAVED_RECIPES,
    )?.[1] as { recipes: { id: string }[] };
    expect(written?.recipes?.map((r) => r.id)).toEqual(["b"]);
  });

  it("importRecipesFromJson accepts array and book shape", () => {
    mockSafeReadLS.mockReturnValue({ recipes: [] });
    const a = importRecipesFromJson(
      JSON.stringify([{ id: "i1", title: "One" }]),
    );
    expect(a).toEqual({ ok: true, count: 1 });

    mockSafeReadLS.mockReturnValue({ recipes: [] });
    const b = importRecipesFromJson(
      JSON.stringify({ recipes: [{ id: "i2", title: "Two" }] }),
    );
    expect(b).toEqual({ ok: true, count: 1 });
  });

  it("importRecipesFromJson returns error for invalid input", () => {
    expect(importRecipesFromJson("not json")).toMatchObject({ ok: false });
    expect(importRecipesFromJson("[]")?.ok).toBe(false);
  });
});

/**
 * Stage 13 PR #073 of `docs/planning/storage-roadmap.md` — recipes
 * read from the SQLite warm cache and `saveRecipeBook` dual-writes
 * via `triggerNutritionDualWrite` without MMKV.
 */
const mockSafeReadLS = jest.fn();
const mockSafeWriteLS = jest.fn();
jest.mock("@/lib/storage", () => ({
  safeReadLS: (...args: unknown[]) => mockSafeReadLS(...args),
  safeWriteLS: (...args: unknown[]) => mockSafeWriteLS(...args),
}));

const mockTriggerDualWrite = jest.fn();
const mockIsRegistered = jest.fn();

jest.mock("../dualWrite", () => ({
  triggerNutritionDualWrite: (...args: unknown[]) =>
    mockTriggerDualWrite(...args),
  isNutritionDualWriteRegistered: () => mockIsRegistered(),
}));

import {
  getRecipeById,
  importRecipesFromJson,
  loadSavedRecipes,
  normalizeSavedRecipe,
  removeSavedRecipe,
  type SavedRecipe,
  upsertSavedRecipe,
} from "../recipeBookStore";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../sqliteReader";

beforeEach(() => {
  mockSafeReadLS.mockReset().mockReturnValue(null);
  mockSafeWriteLS.mockReset().mockReturnValue(true);
  mockTriggerDualWrite.mockReset();
  mockIsRegistered.mockReset().mockReturnValue(true);
  clearNutritionSqliteCache();
});

function makeRecipe(partial: Partial<SavedRecipe>): SavedRecipe {
  return {
    id: partial.id ?? "r",
    title: partial.title ?? "X",
    timeMinutes: partial.timeMinutes ?? null,
    servings: partial.servings ?? null,
    ingredients: partial.ingredients ?? [],
    steps: partial.steps ?? [],
    tips: partial.tips ?? [],
    macros: partial.macros ?? {
      kcal: null,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
    },
    createdAt: partial.createdAt ?? 0,
    updatedAt: partial.updatedAt ?? 0,
  };
}

describe("recipeBookStore", () => {
  it("normalizeSavedRecipe maps partial objects", () => {
    const r = normalizeSavedRecipe({ id: "a1", title: "Суп" });
    expect(r.id).toBe("a1");
    expect(r.title).toBe("Суп");
    expect(r.ingredients).toEqual([]);
  });

  it("loadSavedRecipes returns an empty list when the cache is cold", () => {
    expect(loadSavedRecipes()).toEqual([]);
    expect(mockSafeReadLS).not.toHaveBeenCalled();
  });

  it("loadSavedRecipes reads from the SQLite warm cache, sorted by updatedAt desc", () => {
    __setNutritionSqliteCacheForTests({
      recipes: [
        makeRecipe({ id: "r1", title: "A", updatedAt: 2 }),
        makeRecipe({ id: "r2", title: "B", updatedAt: 5 }),
      ],
    });
    const out = loadSavedRecipes();
    expect(out[0]?.id).toBe("r2");
    expect(out[1]?.id).toBe("r1");
    expect(mockSafeReadLS).not.toHaveBeenCalled();
  });

  it("getRecipeById finds by id from the SQLite warm cache", () => {
    __setNutritionSqliteCacheForTests({
      recipes: [makeRecipe({ id: "q", title: "Q", updatedAt: 1 })],
    });
    expect(getRecipeById("q")?.title).toBe("Q");
    expect(getRecipeById("missing")).toBeUndefined();
  });

  it("upsertSavedRecipe dispatches a dual-write op and never touches MMKV", () => {
    upsertSavedRecipe({ id: "n1", title: "New" });
    expect(mockSafeWriteLS).not.toHaveBeenCalled();
    expect(mockTriggerDualWrite).toHaveBeenCalledTimes(1);
    const [, next] = mockTriggerDualWrite.mock.calls[0]!;
    expect(next.recipes.map((r: { id: string }) => r.id)).toEqual(["n1"]);
  });

  it("upsertSavedRecipe is a silent no-op when dual-write is not registered", () => {
    mockIsRegistered.mockReturnValue(false);
    upsertSavedRecipe({ id: "n1", title: "New" });
    expect(mockTriggerDualWrite).not.toHaveBeenCalled();
    expect(mockSafeWriteLS).not.toHaveBeenCalled();
  });

  it("removeSavedRecipe drops one entry via dual-write", () => {
    __setNutritionSqliteCacheForTests({
      recipes: [
        makeRecipe({ id: "a", title: "A", updatedAt: 1 }),
        makeRecipe({ id: "b", title: "B", updatedAt: 2 }),
      ],
    });
    const ok = removeSavedRecipe("a");
    expect(ok).toBe(true);
    expect(mockSafeWriteLS).not.toHaveBeenCalled();
    expect(mockTriggerDualWrite).toHaveBeenCalledTimes(1);
    const [, next] = mockTriggerDualWrite.mock.calls[0]!;
    expect(next.recipes.map((r: { id: string }) => r.id)).toEqual(["b"]);
  });

  it("removeSavedRecipe returns false when the id is unknown", () => {
    __setNutritionSqliteCacheForTests({
      recipes: [makeRecipe({ id: "a", title: "A" })],
    });
    expect(removeSavedRecipe("missing")).toBe(false);
    expect(mockTriggerDualWrite).not.toHaveBeenCalled();
  });

  it("importRecipesFromJson batches all entries into a single dual-write", () => {
    const a = importRecipesFromJson(
      JSON.stringify([
        { id: "i1", title: "One" },
        { id: "i2", title: "Two" },
      ]),
    );
    expect(a).toEqual({ ok: true, count: 2 });
    expect(mockSafeWriteLS).not.toHaveBeenCalled();
    expect(mockTriggerDualWrite).toHaveBeenCalledTimes(1);
    const [, next] = mockTriggerDualWrite.mock.calls[0]!;
    const ids = next.recipes
      .map((r: { id: string }) => r.id)
      .sort((x: string, y: string) => x.localeCompare(y));
    expect(ids).toEqual(["i1", "i2"]);
  });

  it("importRecipesFromJson accepts the { recipes: […] } book shape", () => {
    const b = importRecipesFromJson(
      JSON.stringify({ recipes: [{ id: "i2", title: "Two" }] }),
    );
    expect(b).toEqual({ ok: true, count: 1 });
    expect(mockTriggerDualWrite).toHaveBeenCalledTimes(1);
  });

  it("importRecipesFromJson returns error for invalid input", () => {
    expect(importRecipesFromJson("not json")).toMatchObject({ ok: false });
    expect(importRecipesFromJson("[]")?.ok).toBe(false);
    expect(mockTriggerDualWrite).not.toHaveBeenCalled();
  });
});

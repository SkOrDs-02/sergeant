// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the IndexedDB-backed saved-recipes book.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

import { __resetSergeantDbForTests } from "../../../shared/lib/idb/sergeantDb";
import {
  deleteSavedRecipe,
  listSavedRecipes,
  normalizeRecipeForSave,
  saveRecipeToBook,
  scaleMacros,
} from "./recipeBook";

const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

beforeEach(() => {
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
  __resetSergeantDbForTests();
});

afterEach(() => {
  if (originalIndexedDB === undefined) {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  } else {
    (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
  }
  __resetSergeantDbForTests();
  vi.clearAllMocks();
});

describe("normalizeRecipeForSave (pure)", () => {
  it("trims title, generates id, and normalizes arrays + macros", () => {
    const r = normalizeRecipeForSave({
      title: "  Борщ  ",
      timeMinutes: -10,
      servings: 4,
      ingredients: ["Буряк", "", "Капуста", 5],
      steps: ["Крок 1"],
      tips: [""],
      macros: { kcal: -2, protein_g: null, fat_g: 3, carbs_g: 10 },
    });
    expect(r.title).toBe("Борщ");
    expect(r.id).toMatch(/^rcp_/);
    expect(r.timeMinutes).toBe(0);
    expect(r.servings).toBe(4);
    expect(r.ingredients).toEqual(["Буряк", "Капуста", "5"]);
    expect(r.steps).toEqual(["Крок 1"]);
    expect(r.tips).toEqual([]);
    expect(r.macros).toEqual({
      kcal: 0,
      protein_g: null,
      fat_g: 3,
      carbs_g: 10,
    });
    expect(typeof r.createdAt).toBe("number");
    expect(typeof r.updatedAt).toBe("number");
  });

  it("preserves an explicit id and createdAt", () => {
    const r = normalizeRecipeForSave({
      title: "X",
      id: "rcp_keep",
      createdAt: 1000,
    });
    expect(r.id).toBe("rcp_keep");
    expect(r.createdAt).toBe(1000);
  });

  it("defaults null sub-fields when absent", () => {
    const r = normalizeRecipeForSave({ title: "Y" });
    expect(r.timeMinutes).toBeNull();
    expect(r.servings).toBeNull();
    expect(r.ingredients).toEqual([]);
    expect(r.macros).toEqual({
      kcal: null,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
    });
  });

  it("tolerates non-object input", () => {
    expect(normalizeRecipeForSave(null).title).toBe("");
  });
});

describe("scaleMacros (pure)", () => {
  it("scales non-null macros by a positive factor", () => {
    expect(
      scaleMacros({ kcal: 100, protein_g: 10, fat_g: null, carbs_g: 5 }, 2),
    ).toEqual({ kcal: 200, protein_g: 20, fat_g: null, carbs_g: 10 });
  });

  it("falls back to factor 1 for non-positive/invalid factor", () => {
    expect(scaleMacros({ kcal: 50 }, -1)).toEqual({
      kcal: 50,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
    });
    expect(scaleMacros({ kcal: 50 }, "bad")).toMatchObject({ kcal: 50 });
  });
});

describe("saveRecipeToBook + listSavedRecipes", () => {
  it("rejects an empty title", async () => {
    expect(await saveRecipeToBook({ title: "  " })).toEqual({
      ok: false,
      error: "Порожня назва рецепту",
    });
  });

  it("saves and lists recipes newest-first", async () => {
    const r1 = await saveRecipeToBook({ title: "Перший" });
    expect(r1.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 2));
    await saveRecipeToBook({ title: "Другий" });
    const list = await listSavedRecipes();
    expect(list.map((x) => x.title)).toEqual(["Другий", "Перший"]);
  });

  it("respects the limit argument", async () => {
    await saveRecipeToBook({ title: "A" });
    await saveRecipeToBook({ title: "B" });
    expect(await listSavedRecipes(1)).toHaveLength(1);
  });
});

describe("deleteSavedRecipe", () => {
  it("returns false for an empty id", async () => {
    expect(await deleteSavedRecipe("")).toBe(false);
  });

  it("removes a saved recipe", async () => {
    const res = await saveRecipeToBook({ title: "Видалити" });
    const id = res.ok ? res.recipe.id : "";
    expect(await deleteSavedRecipe(id)).toBe(true);
    expect(await listSavedRecipes()).toEqual([]);
  });
});

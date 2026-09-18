// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the sessionStorage-backed recipe cache helpers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NUTRITION_RECIPES_CACHE_KEY } from "@sergeant/nutrition-domain";

import {
  buildRecipeCacheKey,
  readRecipeCache,
  writeRecipeCache,
} from "./recipeCache";

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("buildRecipeCacheKey", () => {
  it("produces a stable short hash regardless of item ordering", () => {
    const a = buildRecipeCacheKey(
      "pantry-1",
      [{ name: "Молоко" }, { name: "Яйця" }],
      { goal: "loss", servings: 2, timeMinutes: 30, exclude: "горіхи" },
    );
    const b = buildRecipeCacheKey(
      "pantry-1",
      [{ name: "Яйця" }, { name: "Молоко" }],
      { goal: "loss", servings: 2, timeMinutes: 30, exclude: "горіхи" },
    );
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-z]+$/);
  });

  it("changes when pantry id or prefs change", () => {
    const base = buildRecipeCacheKey("p1", [{ name: "x" }], null);
    expect(buildRecipeCacheKey("p2", [{ name: "x" }], null)).not.toBe(base);
    expect(
      buildRecipeCacheKey("p1", [{ name: "x" }], { goal: "gain" }),
    ).not.toBe(base);
  });
});

describe("readRecipeCache / writeRecipeCache", () => {
  it("round-trips a cache entry", () => {
    writeRecipeCache("key1", {
      recipes: [{ title: "Омлет" }],
      recipesRaw: "raw-json",
    });
    const out = readRecipeCache("key1");
    expect(out).not.toBeNull();
    expect(out?.recipes).toEqual([{ title: "Омлет" }]);
    expect(out?.recipesRaw).toBe("raw-json");
    expect(typeof out?.savedAt).toBe("number");
  });

  it("defaults recipesRaw to empty string when omitted", () => {
    writeRecipeCache("key2", { recipes: [] });
    expect(readRecipeCache("key2")?.recipesRaw).toBe("");
  });

  it("returns null for a missing key", () => {
    expect(readRecipeCache("nope")).toBeNull();
  });

  it("returns null when the stored blob is not valid JSON", () => {
    sessionStorage.setItem(NUTRITION_RECIPES_CACHE_KEY, "{not json");
    expect(readRecipeCache("anything")).toBeNull();
  });

  it("returns null when entry.recipes is not an array", () => {
    sessionStorage.setItem(
      NUTRITION_RECIPES_CACHE_KEY,
      JSON.stringify({ k: { recipes: "bad", recipesRaw: "" } }),
    );
    expect(readRecipeCache("k")).toBeNull();
  });

  it("preserves other keys when writing a new entry", () => {
    writeRecipeCache("a", { recipes: [{ t: 1 }] });
    writeRecipeCache("b", { recipes: [{ t: 2 }] });
    expect(readRecipeCache("a")?.recipes).toEqual([{ t: 1 }]);
    expect(readRecipeCache("b")?.recipes).toEqual([{ t: 2 }]);
  });

  it("recovers from a corrupt existing blob on write", () => {
    sessionStorage.setItem(NUTRITION_RECIPES_CACHE_KEY, "<<corrupt");
    writeRecipeCache("fresh", { recipes: [{ ok: true }] });
    expect(readRecipeCache("fresh")?.recipes).toEqual([{ ok: true }]);
  });

  it("swallows sessionStorage write failures", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    expect(() => writeRecipeCache("x", { recipes: [{ a: 1 }] })).not.toThrow();
    spy.mockRestore();
  });

  it("returns null when sessionStorage read throws", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(readRecipeCache("x")).toBeNull();
    spy.mockRestore();
  });
});

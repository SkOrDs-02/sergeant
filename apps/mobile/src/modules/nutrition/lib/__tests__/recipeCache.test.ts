/**
 * Tests for the mobile recipe session-cache (`recipeCache.ts`).
 *
 * Covers:
 *  - `buildRecipeCacheKey` is stable + invalidates on pantry / prefs change;
 *  - write → read round-trips recipes + rawText;
 *  - TTL: an entry older than `CACHE_TTL_MS` is treated as stale (mobile-only
 *    guard, since RN MMKV persists where web `sessionStorage` would clear).
 */
import { _getMMKVInstance } from "@/lib/storage";

import {
  buildRecipeCacheKey,
  CACHE_TTL_MS,
  readRecipeCache,
  writeRecipeCache,
} from "../recipeCache";

const STORAGE_KEY = "mobile:nutrition_recipe_cache_v1";

beforeEach(() => {
  _getMMKVInstance().clearAll();
  jest.restoreAllMocks();
});

const PREFS = { goal: "balanced", servings: 2, timeMinutes: 25, exclude: "" };
const ITEMS = [{ name: "яйця" }, { name: "молоко" }];

describe("buildRecipeCacheKey", () => {
  it("is stable for the same pantry + prefs (order-independent)", () => {
    const a = buildRecipeCacheKey("p1", ITEMS, PREFS);
    const b = buildRecipeCacheKey(
      "p1",
      [{ name: "молоко" }, { name: "яйця" }],
      PREFS,
    );
    expect(a).toBe(b);
  });

  it("changes when the active pantry changes", () => {
    expect(buildRecipeCacheKey("p1", ITEMS, PREFS)).not.toBe(
      buildRecipeCacheKey("p2", ITEMS, PREFS),
    );
  });

  it("changes when prefs change", () => {
    expect(buildRecipeCacheKey("p1", ITEMS, PREFS)).not.toBe(
      buildRecipeCacheKey("p1", ITEMS, { ...PREFS, goal: "high_protein" }),
    );
  });
});

describe("readRecipeCache / writeRecipeCache", () => {
  it("round-trips recipes and rawText", () => {
    const key = buildRecipeCacheKey("p1", ITEMS, PREFS);
    writeRecipeCache(key, {
      recipes: [{ id: "rcp_ai_x", title: "Омлет" }],
      recipesRaw: "raw-text",
    });
    const out = readRecipeCache<{ id: string; title: string }>(key);
    expect(out?.recipes).toEqual([{ id: "rcp_ai_x", title: "Омлет" }]);
    expect(out?.recipesRaw).toBe("raw-text");
  });

  it("returns null for an unknown key", () => {
    expect(readRecipeCache("missing")).toBeNull();
  });

  it("keeps distinct keys isolated", () => {
    const k1 = buildRecipeCacheKey("p1", ITEMS, PREFS);
    const k2 = buildRecipeCacheKey("p2", ITEMS, PREFS);
    writeRecipeCache(k1, { recipes: [{ id: "a" }], recipesRaw: "" });
    writeRecipeCache(k2, { recipes: [{ id: "b" }], recipesRaw: "" });
    expect(readRecipeCache<{ id: string }>(k1)?.recipes[0]?.id).toBe("a");
    expect(readRecipeCache<{ id: string }>(k2)?.recipes[0]?.id).toBe("b");
  });

  it("treats an entry older than the TTL as stale", () => {
    const key = buildRecipeCacheKey("p1", ITEMS, PREFS);
    writeRecipeCache(key, { recipes: [{ id: "old" }], recipesRaw: "" });
    // Fast-forward past the TTL window.
    const nowSpy = jest
      .spyOn(Date, "now")
      .mockReturnValue(Date.now() + CACHE_TTL_MS + 1000);
    expect(readRecipeCache(key)).toBeNull();
    nowSpy.mockRestore();
  });

  it("returns a fresh entry within the TTL window", () => {
    const key = buildRecipeCacheKey("p1", ITEMS, PREFS);
    writeRecipeCache(key, { recipes: [{ id: "fresh" }], recipesRaw: "" });
    expect(readRecipeCache<{ id: string }>(key)?.recipes[0]?.id).toBe("fresh");
  });
});

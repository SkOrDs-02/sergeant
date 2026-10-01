import { describe, expect, it } from "vitest";
import {
  NUTRITION_PANTRIES_KEY,
  NUTRITION_ACTIVE_PANTRY_KEY,
  NUTRITION_PREFS_KEY,
  NUTRITION_LOG_KEY,
  NUTRITION_RECIPES_CACHE_KEY,
} from "./nutritionTypes.js";

/**
 * These are the localStorage/sessionStorage key names apps/web reads and
 * writes existing users' nutrition data under (nutritionStorage.ts,
 * residualImport.ts, sqliteWriter/diff.ts, recipeCache.ts, ...). Nothing
 * else in this package imports nutritionTypes.ts directly, so without this
 * test the module — and an accidental key rename inside it — has zero
 * coverage: a silent rename here would orphan every existing user's stored
 * data on their next deploy.
 */
describe("nutrition LS/session key constants", () => {
  it("keeps the exact key strings stable", () => {
    expect(NUTRITION_PANTRIES_KEY).toBe("nutrition_pantries_v1");
    expect(NUTRITION_ACTIVE_PANTRY_KEY).toBe("nutrition_active_pantry_v1");
    expect(NUTRITION_PREFS_KEY).toBe("nutrition_prefs_v1");
    expect(NUTRITION_LOG_KEY).toBe("nutrition_log_v1");
    expect(NUTRITION_RECIPES_CACHE_KEY).toBe("nutrition_recipes_cache_v1");
  });

  it("keeps every key distinct (no accidental collision between stores)", () => {
    const keys = [
      NUTRITION_PANTRIES_KEY,
      NUTRITION_ACTIVE_PANTRY_KEY,
      NUTRITION_PREFS_KEY,
      NUTRITION_LOG_KEY,
      NUTRITION_RECIPES_CACHE_KEY,
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

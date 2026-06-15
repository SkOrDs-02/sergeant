/**
 * Last validated: 2026-06-15
 * Status: Active
 *
 * Per-module selector test (T-7) for the nutrition RQ-key namespace.
 *
 * Hard Rule #2 — nutrition hooks (`useFoodSearch`, `useBarcodeProductLookup`)
 * key exclusively through the centralized `nutritionKeys` factory. This suite
 * pins that factory's contract from the nutrition module's side: every key
 * roots under `["nutrition", …]`, the local-vs-OpenFoodFacts search lanes stay
 * on disjoint cache lines for the same query, and the barcode selector fans
 * out per code while never colliding with a food-search line.
 */
import { describe, it, expect } from "vitest";
import { nutritionKeys } from "@shared/lib/api/queryKeys";

const NUTRITION_ROOT = "nutrition";

describe("nutritionKeys — module namespace containment", () => {
  it("every selector roots under the nutrition domain", () => {
    const keys = [
      nutritionKeys.all,
      nutritionKeys.foodSearch,
      nutritionKeys.pushStatus,
      nutritionKeys.foodSearchLocal("гречка"),
      nutritionKeys.foodSearchOff("oats"),
      nutritionKeys.barcode("4820000000001"),
    ];
    for (const key of keys) {
      expect(key[0]).toBe(NUTRITION_ROOT);
    }
  });

  it("local and OFF search lanes never share a cache line for the same query", () => {
    const q = "молоко";
    const local = nutritionKeys.foodSearchLocal(q);
    const off = nutritionKeys.foodSearchOff(q);
    expect(JSON.stringify(local)).not.toBe(JSON.stringify(off));
    // both still carry the query tail so a backspace re-keys correctly
    expect(local).toContain(q);
    expect(off).toContain(q);
  });

  it("foodSearchLocal fans out per query string", () => {
    expect(JSON.stringify(nutritionKeys.foodSearchLocal("a"))).not.toBe(
      JSON.stringify(nutritionKeys.foodSearchLocal("b")),
    );
  });

  it("barcode selector fans out per code and stays disjoint from search lanes", () => {
    const milk = nutritionKeys.barcode("4820000000001");
    const water = nutritionKeys.barcode("4820000000002");
    expect(JSON.stringify(milk)).not.toBe(JSON.stringify(water));
    expect(milk).toContain("4820000000001");
    expect(JSON.stringify(milk)).not.toBe(
      JSON.stringify(nutritionKeys.foodSearchLocal("4820000000001")),
    );
  });

  it("foodSearch prefix is the head of both search-lane keys", () => {
    const prefix = nutritionKeys.foodSearch;
    const local = nutritionKeys.foodSearchLocal("q");
    const off = nutritionKeys.foodSearchOff("q");
    expect(local.slice(0, prefix.length)).toEqual([...prefix]);
    expect(off.slice(0, prefix.length)).toEqual([...prefix]);
  });
});

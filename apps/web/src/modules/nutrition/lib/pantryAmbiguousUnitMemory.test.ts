// @vitest-environment jsdom
/**
 * Last validated: 2026-09-01
 * Status: Active
 * UX-4 (аудит 2026-09-01): памʼять вибору «шт чи г?» — раз обране, вдруге
 * не питаємо про той самий продукт.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { canonicalFoodKey } from "@sergeant/nutrition-domain";
import {
  NUTRITION_PANTRY_AMBIGUOUS_UNIT_MEMORY_KEY,
  getRememberedAmbiguousUnit,
  rememberAmbiguousUnitChoice,
  __resetAmbiguousUnitMemoryForTests,
} from "./pantryAmbiguousUnitMemory";

describe("pantryAmbiguousUnitMemory", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetAmbiguousUnitMemoryForTests();
  });

  it("returns null for a product nobody has been asked about yet", () => {
    expect(getRememberedAmbiguousUnit(canonicalFoodKey("Нутелла"))).toBeNull();
  });

  it("remembers an explicit choice and returns it on the next lookup", () => {
    const key = canonicalFoodKey("Нутелла");
    rememberAmbiguousUnitChoice(key, "г");
    expect(getRememberedAmbiguousUnit(key)).toBe("г");
  });

  it("is keyed by the canonical name — case and grammatical form fold together", () => {
    rememberAmbiguousUnitChoice(canonicalFoodKey("Нутелла"), "г");
    expect(getRememberedAmbiguousUnit(canonicalFoodKey("нутелла"))).toBe("г");
    expect(getRememberedAmbiguousUnit(canonicalFoodKey("НУТЕЛЛА"))).toBe("г");
  });

  it("keeps separate memory per product", () => {
    rememberAmbiguousUnitChoice(canonicalFoodKey("Нутелла"), "г");
    rememberAmbiguousUnitChoice(canonicalFoodKey("Coca-Cola"), "шт");
    expect(getRememberedAmbiguousUnit(canonicalFoodKey("Нутелла"))).toBe("г");
    expect(getRememberedAmbiguousUnit(canonicalFoodKey("Coca-Cola"))).toBe(
      "шт",
    );
  });

  it("a later choice overwrites an earlier one for the same product", () => {
    const key = canonicalFoodKey("Нутелла");
    rememberAmbiguousUnitChoice(key, "шт");
    rememberAmbiguousUnitChoice(key, "г");
    expect(getRememberedAmbiguousUnit(key)).toBe("г");
  });

  it("ignores a malformed value at the storage key (defensive read)", () => {
    localStorage.setItem(
      NUTRITION_PANTRY_AMBIGUOUS_UNIT_MEMORY_KEY,
      JSON.stringify({ [canonicalFoodKey("Нутелла")]: "кг" }),
    );
    expect(getRememberedAmbiguousUnit(canonicalFoodKey("Нутелла"))).toBeNull();
  });

  it("empty key never matches anything", () => {
    rememberAmbiguousUnitChoice("", "г");
    expect(getRememberedAmbiguousUnit("")).toBeNull();
  });
});

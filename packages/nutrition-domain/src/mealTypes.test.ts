import { describe, expect, it } from "vitest";
import { mealTypeByHour } from "./mealTypes.js";

describe("mealTypeByHour", () => {
  it("maps 5–10 to breakfast", () => {
    for (let h = 5; h <= 10; h++) expect(mealTypeByHour(h)).toBe("breakfast");
  });

  it("maps 11–15 to lunch", () => {
    for (let h = 11; h <= 15; h++) expect(mealTypeByHour(h)).toBe("lunch");
  });

  it("maps 16–21 to dinner (including the 16:00 boundary)", () => {
    // Regression: the original split used 17–21 for dinner and 11–15 for
    // lunch, which left hour 16 falling through to "snack". 4 PM is a
    // common meal time and should not collapse to Перекус.
    for (let h = 16; h <= 21; h++) expect(mealTypeByHour(h)).toBe("dinner");
  });

  it("maps late-night and pre-dawn hours to snack", () => {
    for (const h of [22, 23, 0, 1, 2, 3, 4]) {
      expect(mealTypeByHour(h)).toBe("snack");
    }
  });
});

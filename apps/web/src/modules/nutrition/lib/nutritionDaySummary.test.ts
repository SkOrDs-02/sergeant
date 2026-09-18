import { describe, expect, it } from "vitest";
import { getDaySummary } from "./nutritionStorage";

describe("getDaySummary", () => {
  it("detects empty day", () => {
    const s = getDaySummary({}, "2026-01-01");
    expect(s.hasMeals).toBe(false);
    expect(s.hasAnyMacros).toBe(false);
    expect(s.mealCount).toBe(0);
  });

  it("detects meals without macros", () => {
    const log = {
      "2026-01-01": { meals: [{ id: "m1", name: "x", macros: {} }] },
    };
    const s = getDaySummary(log, "2026-01-01");
    expect(s.hasMeals).toBe(true);
    expect(s.hasAnyMacros).toBe(false);
  });

  it("detects meals with at least one macro value", () => {
    const log = {
      "2026-01-01": { meals: [{ id: "m1", name: "x", macros: { kcal: 100 } }] },
    };
    const s = getDaySummary(log, "2026-01-01");
    expect(s.hasMeals).toBe(true);
    expect(s.hasAnyMacros).toBe(true);
    expect(s.kcal).toBe(100);
  });
});

/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import type { NutritionLog } from "@sergeant/nutrition-domain";
import { compareWeekToPrevious } from "./weekCompare";

const meal = (kcal: number) => ({ meals: [{ macros: { kcal } }] });

describe("compareWeekToPrevious", () => {
  // 2026-10-08 четвер; тиждень з понеділка 2026-10-05, минулий з 2026-09-28.
  it("compares weekly averages over days with records", () => {
    const log = {
      "2026-09-28": meal(2000),
      "2026-10-04": meal(2200), // неділя минулого тижня
      "2026-10-05": meal(2300), // понеділок цього
      "2026-10-08": meal(2500),
    } as unknown as NutritionLog;
    expect(compareWeekToPrevious(log, "2026-10-08")).toEqual({
      kind: "compared",
      prevAvgKcal: 2100,
      deltaKcal: 300,
    });
  });

  it("has nothing to compare when the previous week is empty", () => {
    const log = { "2026-10-08": meal(2500) } as unknown as NutritionLog;
    expect(compareWeekToPrevious(log, "2026-10-08")).toEqual({ kind: "none" });
  });

  it("has nothing to compare when this week is empty", () => {
    const log = { "2026-09-30": meal(2000) } as unknown as NutritionLog;
    expect(compareWeekToPrevious(log, "2026-10-08")).toEqual({ kind: "none" });
  });
});

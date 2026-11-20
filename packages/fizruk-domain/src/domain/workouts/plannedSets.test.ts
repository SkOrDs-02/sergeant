import { describe, expect, it } from "vitest";

import { computeWorkoutSetCount } from "./journal.js";
import { buildPlannedSets } from "./plannedSets.js";
import { isSetCompleted } from "./setCompletion.js";

describe("buildPlannedSets", () => {
  it("сіє рівно N рядків із вагою плану і без повторень", () => {
    const sets = buildPlannedSets(3, 62.5);
    expect(sets).toEqual([
      { weightKg: 62.5, reps: 0 },
      { weightKg: 62.5, reps: 0 },
      { weightKg: 62.5, reps: 0 },
    ]);
  });

  it("жоден запланований рядок не зарахований", () => {
    const sets = buildPlannedSets(5, 100);
    expect(sets.some((s) => isSetCompleted(s))).toBe(false);
    expect(
      computeWorkoutSetCount({
        items: [{ type: "strength", sets }],
      }),
    ).toBe(0);
  });

  it("рядки — окремі обʼєкти, правка одного не чіпає сусідів", () => {
    const sets = buildPlannedSets(2);
    expect(sets[0]).not.toBe(sets[1]);
    expect(sets[0]).toEqual({ weightKg: 0, reps: 0 });
  });

  it("некоректна кількість дає порожній план, а не рядки-примари", () => {
    expect(buildPlannedSets(0)).toEqual([]);
    expect(buildPlannedSets(-2)).toEqual([]);
    expect(buildPlannedSets(Number.NaN)).toEqual([]);
    expect(buildPlannedSets(2.7)).toHaveLength(2);
  });

  it("некоректна вага стає нулем", () => {
    expect(buildPlannedSets(1, Number.NaN)).toEqual([{ weightKg: 0, reps: 0 }]);
    expect(buildPlannedSets(1, -5)).toEqual([{ weightKg: 0, reps: 0 }]);
  });
});

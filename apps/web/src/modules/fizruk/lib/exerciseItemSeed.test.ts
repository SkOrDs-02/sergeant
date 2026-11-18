import { describe, expect, it } from "vitest";

import { exerciseItemSeed } from "./exerciseItemSeed";

describe("exerciseItemSeed — нова вправа в сесії за типом виміру", () => {
  it("планка з каталогу — на час, один порожній рядок підходу (зріз 4)", () => {
    expect(
      exerciseItemSeed({ id: "plank", measure: "time", primaryGroup: "core" }),
    ).toEqual({
      measure: "time",
      type: "time",
      sets: [{ weightKg: 0, reps: 0 }],
      durationSec: 0,
      distanceM: 0,
    });
  });

  it("кардіо без поля — дистанція × час (стара евристика), силова — рядок 0×0", () => {
    expect(exerciseItemSeed({ primaryGroup: "cardio" }).type).toBe("distance");
    expect(exerciseItemSeed({ primaryGroup: "chest" })).toEqual({
      measure: "weight_reps",
      type: "strength",
      sets: [{ weightKg: 0, reps: 0 }],
      durationSec: 0,
      distanceM: 0,
    });
  });

  it("вибір людини сильніший за дефолт", () => {
    const seed = exerciseItemSeed(
      { id: "plank", measure: "time", primaryGroup: "core" },
      { plank: "reps" },
    );
    expect(seed.measure).toBe("reps");
    expect(seed.type).toBe("strength");
  });
});

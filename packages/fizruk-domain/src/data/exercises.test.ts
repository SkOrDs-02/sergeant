import { describe, it, expect } from "vitest";
import {
  EXERCISE_CATALOG,
  EXERCISES,
  MUSCLES_BY_PRIMARY_GROUP,
  MUSCLES_UK,
  PRIMARY_GROUPS_UK,
  findExerciseById,
  getExercisesByPrimaryGroup,
  mergeExerciseCatalog,
  searchExercises,
  toExerciseDef,
} from "./index";

describe("exercise catalog", () => {
  it("exposes a non-empty labels map", () => {
    expect(Object.keys(PRIMARY_GROUPS_UK).length).toBeGreaterThan(0);
    expect(Object.keys(MUSCLES_UK).length).toBeGreaterThan(0);
    expect(Object.keys(MUSCLES_BY_PRIMARY_GROUP).length).toBeGreaterThan(0);
  });

  it("has a bounded schemaVersion", () => {
    expect(EXERCISE_CATALOG.schemaVersion).toBeGreaterThanOrEqual(1);
  });

  it("parses a non-empty exercise array", () => {
    expect(Array.isArray(EXERCISES)).toBe(true);
    expect(EXERCISES.length).toBeGreaterThan(0);
  });

  it("finds an exercise by id", () => {
    const ex = findExerciseById("bench_press_barbell");
    expect(ex).toBeTruthy();
    expect(ex?.primaryGroup).toBe("chest");
  });

  it("returns null for unknown / empty id", () => {
    expect(findExerciseById("")).toBeNull();
    expect(findExerciseById("unknown__nope")).toBeNull();
  });

  it("filters by primary group", () => {
    const chest = getExercisesByPrimaryGroup("chest");
    expect(chest.length).toBeGreaterThan(0);
    for (const ex of chest) expect(ex.primaryGroup).toBe("chest");
  });
});

describe("searchExercises", () => {
  it("returns everything for an empty query", () => {
    expect(searchExercises("").length).toBe(EXERCISES.length);
  });

  it("matches by Ukrainian name prefix", () => {
    const res = searchExercises("Жим");
    expect(res.length).toBeGreaterThan(0);
  });

  it("is case-insensitive on English names", () => {
    const res = searchExercises("SQUAT");
    expect(res.some((ex) => ex.id.includes("squat"))).toBe(true);
  });
});

describe("mergeExerciseCatalog", () => {
  it("prepends custom and removes duplicates by id", () => {
    const custom = [
      { id: "my_custom", name: { uk: "Custom" }, primaryGroup: "core" },
    ];
    const merged = mergeExerciseCatalog(custom);
    expect(merged[0]).toEqual(custom[0]);
    expect(merged.length).toBe(EXERCISES.length + 1);
  });

  it("custom entry overrides base with same id", () => {
    // Під strict-index `EXERCISES[0]` — `Exercise | undefined`. Тест
    // покладається на непорожній каталог (перевірено в it("parses…"))
    // — використовуємо non-null assertion як runtime-інваріант.
    const baseFirst = EXERCISES[0]!;
    const override = { ...baseFirst, name: { uk: "Overridden" } };
    const merged = mergeExerciseCatalog([override]);
    const updated = merged.find((ex) => ex.id === baseFirst.id);
    expect(updated?.name?.uk).toBe("Overridden");
    // довжина не зросла (custom переписав base)
    expect(merged.length).toBe(EXERCISES.length);
  });
});

describe("toExerciseDef", () => {
  it("flattens muscles.primary/.secondary", () => {
    const raw = findExerciseById("bench_press_barbell")!;
    const def = toExerciseDef(raw);
    expect(def).toBeTruthy();
    expect(def!.id).toBe("bench_press_barbell");
    expect(Array.isArray(def!.musclesPrimary)).toBe(true);
    expect(def!.musclesPrimary).toContain("pectoralis_major");
  });
  it("returns null for missing id", () => {
    expect(toExerciseDef(null)).toBeNull();
    expect(toExerciseDef({} as never)).toBeNull();
  });
});

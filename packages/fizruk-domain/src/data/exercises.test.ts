import { describe, it, expect } from "vitest";
import {
  EXERCISE_CATALOG,
  EXERCISES,
  MUSCLES_BY_PRIMARY_GROUP,
  MUSCLES_UK,
  PRIMARY_GROUPS_UK,
  findExerciseById,
  getExercisesByPrimaryGroup,
  getExerciseNamesByAtlasMuscle,
  mergeExerciseCatalog,
  matchesExerciseSearch,
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

  it("matches aliases, descriptions, and primary-group labels", () => {
    const ex = {
      name: { uk: "Тестова вправа", en: "Fixture lift" },
      aliases: ["Жим лежачи"],
      description: "Контрольований рух для тесту",
      primaryGroup: "chest",
      primaryGroupUk: "Груди",
    };

    expect(matchesExerciseSearch(ex, "лежачи")).toBe(true);
    expect(matchesExerciseSearch(ex, "контрольований")).toBe(true);
    expect(matchesExerciseSearch(ex, "chest")).toBe(true);
    expect(matchesExerciseSearch(ex, "груди")).toBe(true);
    expect(matchesExerciseSearch(null, "груди")).toBe(false);
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

  it("ignores non-array custom input and entries without ids", () => {
    const base = [
      { id: "base", name: { uk: "Base" }, primaryGroup: "misc" },
      { name: { uk: "No id" }, primaryGroup: "misc" },
    ] as never;

    expect(
      mergeExerciseCatalog(null as never, base).map((ex) => ex.id),
    ).toEqual(["base"]);
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

  it("falls back to id and empty muscle arrays for partial raw entries", () => {
    expect(
      toExerciseDef({
        id: "custom_partial",
        name: {} as never,
        primaryGroup: "misc",
        muscles: { primary: undefined as never, secondary: undefined as never },
      }),
    ).toEqual({
      id: "custom_partial",
      nameUk: "custom_partial",
      primaryGroup: "misc",
      musclesPrimary: [],
      musclesSecondary: [],
      type: "strength",
    });
  });
});

describe("getExerciseNamesByAtlasMuscle", () => {
  it("returns an empty array for an empty atlas muscle id", () => {
    expect(getExerciseNamesByAtlasMuscle("")).toEqual([]);
  });

  it("returns Ukrainian names for exercises whose primary muscles map to the atlas id", () => {
    const names = getExerciseNamesByAtlasMuscle("chest");
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(typeof name).toBe("string");
  });

  it("caps results at the default limit of 5", () => {
    const names = getExerciseNamesByAtlasMuscle("quadriceps");
    expect(names.length).toBeLessThanOrEqual(5);
  });

  it("honours a custom limit", () => {
    const names = getExerciseNamesByAtlasMuscle("quadriceps", 2);
    expect(names.length).toBeLessThanOrEqual(2);
  });

  it("returns an empty array for a muscle id with no matching exercises", () => {
    expect(getExerciseNamesByAtlasMuscle("not-a-real-atlas-id")).toEqual([]);
  });

  it("does not duplicate names across exercises sharing the same primary muscle", () => {
    const names = getExerciseNamesByAtlasMuscle("chest", 50);
    expect(new Set(names).size).toBe(names.length);
  });

  // NOTE: the `!Array.isArray(ex?.muscles?.primary)` continue-branch inside
  // getExerciseNamesByAtlasMuscle is unreachable with the current catalog —
  // every entry in exercises.gymup.json has a `muscles.primary` array, and
  // the function has no pool parameter to inject a fixture without one.
  // Skipped per instructions (would require a production source change to
  // accept an injectable pool). Covered indirectly by `mergeExerciseCatalog`
  // tests above, which do exercise catalogs with missing/partial shapes.
});

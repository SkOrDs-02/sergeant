import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  EXERCISE_CATALOG,
  EXERCISES,
  EXERCISE_IMAGE_IDS,
  EXERCISE_INJURY_ZONES,
  MUSCLES_BY_PRIMARY_GROUP,
  MUSCLES_UK,
  PRIMARY_GROUPS_UK,
  exerciseImagePaths,
  findExerciseById,
  getExerciseLocations,
  getExercisesByPrimaryGroup,
  getExerciseNamesByAtlasMuscle,
  matchesExerciseLocation,
  mergeExerciseCatalog,
  matchesExerciseSearch,
  searchExercises,
  toExerciseDef,
} from "./index";
import { PROGRAM_CATALOGUE } from "../domain/programs/catalogue";

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

// Гейт цілісності каталогу. Він існує, щоб нова вправа не могла приїхати
// без мапи зон травм (ADR-0083), без аліасів або з id, який уже зайнятий:
// це дисципліна, яку не можна лишати на уважність автора PR.
describe("catalog integrity gate", () => {
  const webPublicRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../apps/web/public",
  );

  it("references existing exercise images", () => {
    const missing: string[] = [];

    for (const id of EXERCISE_IMAGE_IDS) {
      for (const imagePath of exerciseImagePaths(id)) {
        if (
          !existsSync(resolve(webPublicRoot, imagePath.replace(/^\/+/, "")))
        ) {
          missing.push(`${id}:${imagePath}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  // Реєстр пишеться генератором, але лежить у git і його можна відредагувати
  // руками. Id, якого немає в каталозі, дав би вправі-привиду шлях у public/.
  it("keeps the image registry aligned with the catalog", () => {
    const catalogIds = new Set(EXERCISES.map((exercise) => exercise.id));
    const orphans = [...EXERCISE_IMAGE_IDS].filter((id) => !catalogIds.has(id));

    expect(orphans).toEqual([]);
    expect(exerciseImagePaths("definitely-not-an-exercise")).toEqual([]);
  });

  it("maps every exercise to injury zones", () => {
    const missing = EXERCISES.filter(
      (ex) => !EXERCISE_INJURY_ZONES[ex.id]?.length,
    ).map((ex) => ex.id);
    expect(missing).toEqual([]);
  });

  it("resolves every program exercise id in the catalog", () => {
    const unknown: string[] = [];
    for (const program of PROGRAM_CATALOGUE) {
      for (const session of Object.values(program.sessions)) {
        for (const id of session.exerciseIds) {
          if (!findExerciseById(id)) unknown.push(`${program.id}:${id}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  // Домашня програма — це перевірка фільтра локації на реальних даних:
  // якщо туди просочиться вправа зі штангою, зламається обіцянка «без
  // обладнання», а не просто тест.
  it("keeps the home program free of gym-only exercises", () => {
    const home = PROGRAM_CATALOGUE.find((p) => p.id === "home_bodyweight");
    expect(home).toBeTruthy();
    const gymOnly: string[] = [];
    for (const session of Object.values(home!.sessions)) {
      for (const id of session.exerciseIds) {
        const ex = findExerciseById(id);
        if (!getExerciseLocations(ex).includes("home")) gymOnly.push(id);
      }
    }
    expect(gymOnly).toEqual([]);
  });

  it("keeps exercise ids unique", () => {
    const ids = EXERCISES.map((ex) => ex.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every exercise at least one alias", () => {
    const without = EXERCISES.filter((ex) => !ex.aliases?.length).map(
      (ex) => ex.id,
    );
    expect(without).toEqual([]);
  });

  it("never shares an alias between two exercises", () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const ex of EXERCISES) {
      for (const alias of ex.aliases || []) {
        const key = alias.trim().toLowerCase();
        const seen = owner.get(key);
        if (seen) clashes.push(`${alias}: ${seen} / ${ex.id}`);
        else owner.set(key, ex.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("resolves every exercise to at least one location", () => {
    const homeless = EXERCISES.filter(
      (ex) => getExerciseLocations(ex).length === 0,
    ).map((ex) => ex.id);
    expect(homeless).toEqual([]);
  });

  it("gives every exercise a technique description", () => {
    const without = EXERCISES.filter((ex) => !ex.description?.trim()).map(
      (ex) => ex.id,
    );
    expect(without).toEqual([]);
  });
});

describe("getExerciseLocations", () => {
  it("derives location from equipment", () => {
    expect(getExerciseLocations({ equipment: ["bodyweight"] })).toEqual([
      "home",
      "outdoor",
    ]);
    expect(getExerciseLocations({ equipment: ["barbell", "bench"] })).toEqual([
      "gym",
    ]);
    expect(getExerciseLocations({ equipment: ["dumbbell"] })).toEqual([
      "gym",
      "home",
    ]);
  });

  it("falls back to gym for unknown or missing equipment", () => {
    expect(getExerciseLocations({ equipment: [] })).toEqual(["gym"]);
    expect(getExerciseLocations(null)).toEqual(["gym"]);
    expect(getExerciseLocations({ equipment: ["hoverboard"] })).toEqual([
      "gym",
    ]);
  });

  it("passes everything through for an empty location filter", () => {
    expect(matchesExerciseLocation({ equipment: ["barbell"] }, "")).toBe(true);
    expect(matchesExerciseLocation({ equipment: ["barbell"] }, "home")).toBe(
      false,
    );
    expect(matchesExerciseLocation({ equipment: ["band"] }, "outdoor")).toBe(
      true,
    );
  });
});

// Реальні запити людини, а не назви з каталогу: пошук, який не знаходить
// «бенч», для власника зламаний, навіть якщо всі інші тести зелені.
describe("slang search", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["бенч", "bench_press_barbell"],
    ["станова", "deadlift"],
    ["присід", "squat_barbell"],
    ["підтяг", "pullup"],
    ["банки", "bicep_curl_dumbbell"],
    ["жим лежа", "bench_press_barbell"],
    ["румунка", "romanian_deadlift"],
    ["планка", "plank"],
  ];

  for (const [query, expectedId] of cases) {
    it(`finds ${expectedId} for "${query}"`, () => {
      const top = searchExercises(query)
        .slice(0, 3)
        .map((ex) => ex.id);
      expect(top).toContain(expectedId);
    });
  }

  it("finds a biceps exercise for «біцуха»", () => {
    const top = searchExercises("біцуха").slice(0, 3);
    expect(top.length).toBeGreaterThan(0);
    expect(top.some((ex) => ex.primaryGroup === "biceps")).toBe(true);
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

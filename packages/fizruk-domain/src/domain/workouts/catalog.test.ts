import { describe, expect, it } from "vitest";

import {
  buildExerciseCatalogGroups,
  exerciseDisplayName,
  filterExercisesByEquipment,
  filterExercisesByPrimaryGroup,
  filterExercisesBySearch,
  groupExercisesByPrimary,
  PRIMARY_GROUP_ORDER,
} from "./catalog.js";
import type { WorkoutExerciseCatalogEntry } from "./types.js";

const POOL: WorkoutExerciseCatalogEntry[] = [
  {
    id: "bench",
    name: { uk: "Жим штанги лежачи", en: "Bench Press" },
    primaryGroup: "chest",
    primaryGroupUk: "Груди",
    muscles: { primary: ["pectoralis_major"], secondary: ["triceps"] },
    aliases: ["bench", "жим лежачи"],
    equipment: ["barbell", "bench"],
  },
  {
    id: "pushup",
    name: { uk: "Віджимання", en: "Push-up" },
    primaryGroup: "chest",
    muscles: { primary: ["pectoralis_major"] },
    equipment: ["bodyweight"],
  },
  {
    id: "squat",
    name: { uk: "Присідання зі штангою", en: "Back Squat" },
    primaryGroup: "quadriceps",
    muscles: { primary: ["quadriceps"] },
    equipment: ["barbell"],
  },
  {
    id: "deadlift",
    name: { uk: "Тяга", en: "Deadlift" },
    primaryGroup: "back",
    muscles: { primary: ["erector_spinae"] },
    equipment: ["barbell"],
  },
  {
    id: "mystery",
    name: { uk: "Невідома" },
    primaryGroup: "mystery_group",
  },
];

describe("filterExercisesBySearch", () => {
  it("matches on uk / en name and aliases (case-insensitive)", () => {
    expect(filterExercisesBySearch(POOL, "BENCH").map((x) => x.id)).toEqual([
      "bench",
    ]);
    expect(filterExercisesBySearch(POOL, "лежачи").map((x) => x.id)).toEqual([
      "bench",
    ]);
    expect(filterExercisesBySearch(POOL, "squat").map((x) => x.id)).toEqual([
      "squat",
    ]);
  });

  it("matches on primary group id / uk label", () => {
    expect(
      filterExercisesBySearch(POOL, "chest")
        .map((x) => x.id)
        .sort(),
    ).toEqual(["bench", "pushup"]);
    expect(
      filterExercisesBySearch(POOL, "груди")
        .map((x) => x.id)
        .sort(),
    ).toEqual(["bench"]);
  });

  it("returns a copy when the query is empty", () => {
    const result = filterExercisesBySearch(POOL, "");
    expect(result).not.toBe(POOL);
    expect(result).toHaveLength(POOL.length);
  });
});

describe("filterExercisesByPrimaryGroup", () => {
  it("keeps matches only", () => {
    expect(
      filterExercisesByPrimaryGroup(POOL, "chest").map((x) => x.id),
    ).toEqual(["bench", "pushup"]);
  });

  it("returns everything when the group is null or empty", () => {
    expect(filterExercisesByPrimaryGroup(POOL, null)).toHaveLength(POOL.length);
    expect(filterExercisesByPrimaryGroup(POOL, "")).toHaveLength(POOL.length);
  });
});

describe("groupExercisesByPrimary", () => {
  it("sorts buckets in the canonical order", () => {
    const groups = groupExercisesByPrimary(POOL, {
      primaryGroupsUk: {
        chest: "Груди",
        quadriceps: "Квадрицепс",
        back: "Спина",
      },
    });
    const orderIndex = (id: string) => PRIMARY_GROUP_ORDER.indexOf(id);
    const orderedKnown = groups
      .filter((g) => orderIndex(g.id) >= 0)
      .map((g) => g.id);
    expect(orderedKnown).toEqual(
      [...orderedKnown].sort((a, b) => orderIndex(a) - orderIndex(b)),
    );
  });

  it("places unknown primary groups after the canonical ones", () => {
    const groups = groupExercisesByPrimary(POOL);
    const last = groups[groups.length - 1]!;
    expect(last.id).toBe("mystery_group");
  });

  it("sorts multiple unknown primary groups alphabetically by id", () => {
    const pool: WorkoutExerciseCatalogEntry[] = [
      { id: "z1", name: { uk: "Z" }, primaryGroup: "zzz_unknown" },
      { id: "a1", name: { uk: "A" }, primaryGroup: "aaa_unknown" },
    ];
    const groups = groupExercisesByPrimary(pool);
    expect(groups.map((g) => g.id)).toEqual(["aaa_unknown", "zzz_unknown"]);
  });

  it("uses explicit totalsBy counts over the filtered bucket size", () => {
    const filtered = [POOL[0]!]; // just "bench"
    const groups = groupExercisesByPrimary(filtered, { totalsBy: POOL });
    const chest = groups.find((g) => g.id === "chest")!;
    expect(chest.items).toHaveLength(1);
    expect(chest.total).toBe(2); // bench + pushup in the unfiltered pool
  });

  it("falls back to bucket size when totalsBy is omitted", () => {
    const groups = groupExercisesByPrimary(POOL);
    const chest = groups.find((g) => g.id === "chest")!;
    expect(chest.total).toBe(chest.items.length);
  });

  it("uses the uk label when provided and falls back to the id", () => {
    const groups = groupExercisesByPrimary(POOL, {
      primaryGroupsUk: { chest: "Груди" },
    });
    const chest = groups.find((g) => g.id === "chest")!;
    const back = groups.find((g) => g.id === "back")!;
    expect(chest.label).toBe("Груди");
    expect(back.label).toBe("back");
  });
});

describe("buildExerciseCatalogGroups", () => {
  it("applies both search and primary-group filters", () => {
    const groups = buildExerciseCatalogGroups(POOL, {
      query: "лежачи",
      primaryGroup: "chest",
      primaryGroupsUk: { chest: "Груди" },
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.id).toBe("chest");
    expect(groups[0]!.items.map((x) => x.id)).toEqual(["bench"]);
    // Header total is unfiltered per-group (2 chest exercises in POOL).
    expect(groups[0]!.total).toBe(2);
  });

  it("returns an empty list when nothing matches", () => {
    expect(buildExerciseCatalogGroups(POOL, { query: "zzz" })).toEqual([]);
  });

  it("copes with an empty pool", () => {
    expect(buildExerciseCatalogGroups([])).toEqual([]);
  });
});

describe("filterExercisesByEquipment", () => {
  it("filters by one equipment tag", () => {
    expect(
      filterExercisesByEquipment(POOL, ["barbell"]).map((x) => x.id),
    ).toEqual(["bench", "squat", "deadlift"]);
  });

  it("filters by multiple equipment tags (OR logic)", () => {
    expect(
      filterExercisesByEquipment(POOL, ["bodyweight"]).map((x) => x.id),
    ).toEqual(["pushup"]);
  });

  it("returns all when equipmentIds is null or empty", () => {
    expect(filterExercisesByEquipment(POOL, null)).toHaveLength(POOL.length);
    expect(filterExercisesByEquipment(POOL, [])).toHaveLength(POOL.length);
  });
});

describe("exerciseDisplayName", () => {
  it("prefers uk > en > id", () => {
    expect(exerciseDisplayName({ id: "x", name: { uk: "Ук", en: "En" } })).toBe(
      "Ук",
    );
    expect(exerciseDisplayName({ id: "x", name: { en: "En" } })).toBe("En");
    expect(exerciseDisplayName({ id: "x" })).toBe("x");
    expect(exerciseDisplayName(null)).toBe("");
  });
});

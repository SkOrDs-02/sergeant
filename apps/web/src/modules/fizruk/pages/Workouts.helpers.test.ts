import { describe, it, expect } from "vitest";
import type { RawExerciseDef } from "@sergeant/fizruk-domain/data";
import type { Workout } from "@sergeant/fizruk-domain";
import {
  buildGroupedExercises,
  collectLastByExerciseId,
  formatActiveDuration,
  MUSCLE_GROUP_ORDER,
} from "./Workouts.helpers";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeExercise(
  id: string,
  primaryGroup: string,
  equipment: string[] = [],
): RawExerciseDef {
  return { id, name: { uk: id }, primaryGroup, equipment };
}

function makeWorkout(
  id: string,
  startedAt: string,
  items: Workout["items"] = [],
): Workout {
  return {
    id,
    startedAt,
    items: items ?? [],
    isActive: false,
    endedAt: null,
    date: startedAt.slice(0, 10),
    templateId: null,
    wellbeing: null,
  } as unknown as Workout;
}

// ─── buildGroupedExercises ────────────────────────────────────────────────────

describe("buildGroupedExercises", () => {
  const exercises: RawExerciseDef[] = [
    makeExercise("bench", "chest", ["barbell"]),
    makeExercise("row", "back", ["barbell"]),
    makeExercise("squat", "quadriceps", ["barbell"]),
    makeExercise("curl", "biceps", ["dumbbell"]),
  ];

  const labels: Record<string, string> = {
    chest: "Груди",
    back: "Спина",
    quadriceps: "Квадрицепси",
    biceps: "Біцепс",
  };

  it("groups exercises by primaryGroup", () => {
    const groups = buildGroupedExercises(exercises, [], labels);
    const ids = groups.map((g) => g.id);
    expect(ids).toContain("chest");
    expect(ids).toContain("back");
    expect(ids).toContain("quadriceps");
    expect(ids).toContain("biceps");
  });

  it("returns the correct count per group", () => {
    const groups = buildGroupedExercises(exercises, [], labels);
    const chest = groups.find((g) => g.id === "chest");
    expect(chest?.total).toBe(1);
    expect(chest?.items).toHaveLength(1);
  });

  it("uses the Ukrainian label when provided", () => {
    const groups = buildGroupedExercises(exercises, [], labels);
    const back = groups.find((g) => g.id === "back");
    expect(back?.label).toBe("Спина");
  });

  it("falls back to the group id when label is missing", () => {
    const groups = buildGroupedExercises(exercises, [], {});
    const chest = groups.find((g) => g.id === "chest");
    expect(chest?.label).toBe("chest");
  });

  it("filters by equipment when equipmentFilter is non-empty", () => {
    // Only dumbbell exercises → should keep curl (biceps) and drop barbell ones
    const groups = buildGroupedExercises(exercises, ["dumbbell"], labels);
    const ids = groups.map((g) => g.id);
    expect(ids).toContain("biceps");
    expect(ids).not.toContain("chest"); // bench is barbell only
  });

  it("respects MUSCLE_GROUP_ORDER for sorting", () => {
    const groups = buildGroupedExercises(exercises, [], labels);
    const chestIdx = groups.findIndex((g) => g.id === "chest");
    const backIdx = groups.findIndex((g) => g.id === "back");
    const quadsIdx = groups.findIndex((g) => g.id === "quadriceps");
    // chest (index 0) should come before back (index 1) and quadriceps (index 8)
    expect(chestIdx).toBeLessThan(backIdx);
    expect(backIdx).toBeLessThan(quadsIdx);
  });

  it("MUSCLE_GROUP_ORDER has chest first", () => {
    expect(MUSCLE_GROUP_ORDER[0]).toBe("chest");
  });

  it("returns empty array for empty exercise list", () => {
    expect(buildGroupedExercises([], [], labels)).toEqual([]);
  });
});

// ─── collectLastByExerciseId ──────────────────────────────────────────────────

describe("collectLastByExerciseId", () => {
  it("returns empty object for no workouts", () => {
    expect(collectLastByExerciseId([], null)).toEqual({});
  });

  it("picks the most recent workout item for each exerciseId", () => {
    const older = makeWorkout("w1", "2026-01-01T10:00:00Z", [
      {
        id: "i1",
        exerciseId: "bench",
        nameUk: "Bench",
        primaryGroup: "chest",
        musclesPrimary: [],
        musclesSecondary: [],
        type: "strength",
        sets: [{ weightKg: 80, reps: 5, id: "s1" }],
      },
    ]);
    const newer = makeWorkout("w2", "2026-01-08T10:00:00Z", [
      {
        id: "i2",
        exerciseId: "bench",
        nameUk: "Bench",
        primaryGroup: "chest",
        musclesPrimary: [],
        musclesSecondary: [],
        type: "strength",
        sets: [{ weightKg: 90, reps: 5, id: "s2" }],
      },
    ]);

    const result = collectLastByExerciseId([older, newer], null);
    expect(result["bench"]).toBeDefined();
    // The newer workout has weightKg 90
    expect(result["bench"]?.sets?.[0]?.weightKg).toBe(90);
  });

  it("skips the active workout", () => {
    const active = makeWorkout("active-id", "2026-01-10T10:00:00Z", [
      {
        id: "i1",
        exerciseId: "squat",
        nameUk: "Squat",
        primaryGroup: "quadriceps",
        musclesPrimary: [],
        musclesSecondary: [],
        type: "strength",
        sets: [],
      },
    ]);

    const result = collectLastByExerciseId([active], "active-id");
    expect(result["squat"]).toBeUndefined();
  });

  it("skips items with no exerciseId", () => {
    const w = makeWorkout("w1", "2026-01-01T10:00:00Z", [
      {
        id: "i1",
        exerciseId: null as unknown as string,
        nameUk: "?",
        primaryGroup: "chest",
        musclesPrimary: [],
        musclesSecondary: [],
        type: "strength",
        sets: [],
      },
    ]);
    expect(collectLastByExerciseId([w], null)).toEqual({});
  });
});

// ─── formatActiveDuration ─────────────────────────────────────────────────────

describe("formatActiveDuration", () => {
  it("returns null when startedAt is null", () => {
    expect(formatActiveDuration(null, null, Date.now())).toBeNull();
  });

  it("returns null when startedAt is undefined", () => {
    expect(formatActiveDuration(undefined, null, Date.now())).toBeNull();
  });

  it("formats duration as mm:ss", () => {
    const start = new Date("2026-01-01T10:00:00Z").toISOString();
    const end = new Date("2026-01-01T10:01:30Z").toISOString();
    const result = formatActiveDuration(start, end, Date.now());
    expect(result).toBe("01:30");
  });

  it("zero-pads both minutes and seconds", () => {
    const start = new Date("2026-01-01T10:00:00Z").toISOString();
    const end = new Date("2026-01-01T10:00:05Z").toISOString();
    const result = formatActiveDuration(start, end, Date.now());
    expect(result).toBe("00:05");
  });

  it("uses `now` when endedAt is absent", () => {
    const start = new Date(Date.now() - 90_000).toISOString(); // 90 s ago
    const result = formatActiveDuration(start, null, Date.now());
    expect(result).not.toBeNull();
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it("returns null when end < start (invalid)", () => {
    const start = new Date("2026-01-01T10:01:00Z").toISOString();
    const end = new Date("2026-01-01T10:00:00Z").toISOString();
    expect(formatActiveDuration(start, end, Date.now())).toBeNull();
  });

  it("returns '00:00' for equal start and end", () => {
    const ts = new Date("2026-01-01T10:00:00Z").toISOString();
    expect(formatActiveDuration(ts, ts, Date.now())).toBe("00:00");
  });
});

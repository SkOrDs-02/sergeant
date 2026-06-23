import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./dualWrite/index.js", () => ({
  isFizrukDualWriteRegistered: () => mockRegistered(),
}));

vi.mock("./sqliteReader.js", () => ({
  getCachedFizrukSqliteState: () => mockCache(),
}));

const mockRegistered = vi.fn<() => boolean>();
const mockCache = vi.fn();

import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractCustomExerciseSnapshots,
  extractDailyLogSnapshots,
  extractMeasurementSnapshots,
  extractMonthlyPlanSnapshot,
  extractWorkoutSnapshots,
  extractWorkoutTemplateSnapshots,
  peekFizrukDualWriteState,
} from "./fizrukDualWriteState";

beforeEach(() => {
  mockRegistered.mockReset();
  mockCache.mockReset();
});

describe("EMPTY_FIZRUK_DUAL_WRITE_STATE", () => {
  it("has all empty slots", () => {
    expect(EMPTY_FIZRUK_DUAL_WRITE_STATE).toEqual({
      workouts: [],
      customExercises: [],
      measurements: [],
      dailyLog: [],
      monthlyPlan: null,
      workoutTemplates: [],
    });
  });
});

describe("extractWorkoutSnapshots", () => {
  it("skips falsy / id-less entries", () => {
    const out = extractWorkoutSnapshots([
      null as never,
      {} as never,
      { id: "w1", startedAt: "2024-01-01T00:00:00Z" } as never,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("w1");
  });

  it("flattens nested items, sets, groups, checklists and wellbeing", () => {
    const [snap] = extractWorkoutSnapshots([
      {
        id: "w1",
        startedAt: "2024-01-01T00:00:00Z",
        endedAt: null,
        items: [
          {
            id: "i1",
            exerciseId: "e1",
            nameUk: "Жим",
            primaryGroup: "chest",
            musclesPrimary: ["pec"],
            musclesSecondary: ["tri"],
            type: "strength",
            sets: [{ weightKg: 50, reps: 5, rpe: 8 }],
            durationSec: 30,
            distanceM: 100,
          },
        ],
        groups: [{ id: "g1", itemIds: ["i1"] }],
        warmup: [{ id: "c1", done: true, label: "stretch" }],
        cooldown: [{ id: "c2", done: false, label: "walk" }],
        note: "ok",
        wellbeing: { energy: 4, mood: 5 },
      } as never,
    ]);
    expect(snap!.items[0]!.sets).toEqual([{ weightKg: 50, reps: 5, rpe: 8 }]);
    expect(snap!.items[0]!.durationSec).toBe(30);
    expect(snap!.groups).toEqual([{ id: "g1", itemIds: ["i1"] }]);
    expect(snap!.warmup).toEqual([{ id: "c1", done: true, label: "stretch" }]);
    expect(snap!.wellbeing).toEqual({ energy: 4, mood: 5 });
  });

  it("defaults missing fields safely", () => {
    const [snap] = extractWorkoutSnapshots([
      { id: "w2", items: [{ id: "i", exerciseId: "" }] } as never,
    ]);
    expect(snap!.startedAt).toBe("");
    expect(snap!.warmup).toBeNull();
    expect(snap!.wellbeing).toBeNull();
    expect(snap!.items[0]!.type).toBe("strength");
  });
});

describe("extractCustomExerciseSnapshots", () => {
  it("keeps only id-bearing objects and stringifies id", () => {
    const out = extractCustomExerciseSnapshots([
      null as never,
      { id: 7, name: "x" } as never,
    ]);
    expect(out).toEqual([{ id: "7", name: "x" }]);
  });
});

describe("extractMeasurementSnapshots", () => {
  it("requires id and at", () => {
    expect(extractMeasurementSnapshots([{ id: "m1" } as never])).toHaveLength(
      0,
    );
  });

  it("coalesces bicepLCm/bicepRCm into bicepCm", () => {
    const [snap] = extractMeasurementSnapshots([
      { id: "m1", at: "2024-01-01", bicepLCm: 30 } as never,
    ]);
    expect((snap as Record<string, unknown>)["bicepCm"]).toBe(30);
  });

  it("keeps explicit bicepCm untouched", () => {
    const [snap] = extractMeasurementSnapshots([
      { id: "m1", at: "2024-01-01", bicepCm: 40, bicepLCm: 30 } as never,
    ]);
    expect((snap as Record<string, unknown>)["bicepCm"]).toBe(40);
  });
});

describe("extractDailyLogSnapshots", () => {
  it("requires id and at and coalesces moodScore over mood", () => {
    const [snap] = extractDailyLogSnapshots([
      {
        id: "d1",
        at: "2024-01-01",
        weightKg: 80,
        sleepHours: 7,
        energyLevel: 3,
        moodScore: 4,
        mood: 1,
        note: "hi",
      },
    ]);
    expect(snap).toEqual({
      id: "d1",
      at: "2024-01-01",
      weightKg: 80,
      sleepHours: 7,
      energyLevel: 3,
      mood: 4,
      note: "hi",
    });
  });

  it("falls back to mood and coerces invalid numbers to null", () => {
    const [snap] = extractDailyLogSnapshots([
      {
        id: "d2",
        at: "x",
        mood: 2,
        weightKg: "bad" as never,
        note: 5 as never,
      },
    ]);
    expect(snap!.mood).toBe(2);
    expect(snap!.weightKg).toBeNull();
    expect(snap!.note).toBe("");
  });
});

describe("extractMonthlyPlanSnapshot", () => {
  it("returns null for nullish input", () => {
    expect(extractMonthlyPlanSnapshot(null)).toBeNull();
    expect(extractMonthlyPlanSnapshot(undefined)).toBeNull();
  });

  it("clamps reminder hour/minute and filters invalid days", () => {
    const snap = extractMonthlyPlanSnapshot({
      reminderEnabled: false,
      reminderHour: 99,
      reminderMinute: -5,
      days: {
        "2024-01-01": { templateId: "t1" },
        "2024-01-02": { templateId: 5 as never },
      },
    });
    const parsed = JSON.parse(snap!.dataJson);
    expect(parsed.reminderEnabled).toBe(false);
    // 99 is finite → clamped to the 0..23 ceiling.
    expect(parsed.reminderHour).toBe(23);
    // -5 is finite → clamped to the 0 floor.
    expect(parsed.reminderMinute).toBe(0);
    expect(parsed.days).toEqual({ "2024-01-01": { templateId: "t1" } });
  });

  it("defaults reminderEnabled true when not explicitly false", () => {
    const snap = extractMonthlyPlanSnapshot({ reminderHour: 6 });
    const parsed = JSON.parse(snap!.dataJson);
    expect(parsed.reminderEnabled).toBe(true);
    expect(parsed.reminderHour).toBe(6);
  });

  it("defaults hour to 18 / minute to 0 when non-finite, days to {} when absent", () => {
    const snap = extractMonthlyPlanSnapshot({
      reminderHour: NaN,
      reminderMinute: NaN,
    });
    const parsed = JSON.parse(snap!.dataJson);
    expect(parsed.reminderHour).toBe(18);
    expect(parsed.reminderMinute).toBe(0);
    expect(parsed.days).toEqual({});
  });
});

describe("extractWorkoutTemplateSnapshots", () => {
  it("filters non-string exerciseIds and defaults timestamps", () => {
    const [snap] = extractWorkoutTemplateSnapshots([
      {
        id: "t1",
        name: "PPL",
        exerciseIds: ["a", 5 as never, "b"],
        groups: [{ id: "g" }],
      },
    ]);
    expect(snap).toEqual({
      id: "t1",
      name: "PPL",
      exerciseIds: ["a", "b"],
      groups: [{ id: "g" }],
      updatedAt: "",
      lastUsedAt: null,
    });
  });

  it("skips id-less templates", () => {
    expect(extractWorkoutTemplateSnapshots([{ name: "x" }])).toHaveLength(0);
  });
});

describe("peekFizrukDualWriteState", () => {
  it("returns null when dual-write is not registered", () => {
    mockRegistered.mockReturnValue(false);
    expect(peekFizrukDualWriteState()).toBeNull();
  });

  it("returns null when the cache read throws", () => {
    mockRegistered.mockReturnValue(true);
    mockCache.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(peekFizrukDualWriteState()).toBeNull();
  });

  it("maps the cached state through the extractors", () => {
    mockRegistered.mockReturnValue(true);
    mockCache.mockReturnValue({
      workouts: [{ id: "w1", startedAt: "2024-01-01T00:00:00Z" }],
      customExercises: [{ id: "e1" }],
      measurements: [{ id: "m1", at: "2024-01-01" }],
      dailyLog: [{ id: "d1", at: "2024-01-01" }],
      monthlyPlan: { reminderHour: 8 },
      workoutTemplates: [{ id: "t1", name: "T" }],
    });
    const state = peekFizrukDualWriteState();
    expect(state!.workouts).toHaveLength(1);
    expect(state!.customExercises).toEqual([{ id: "e1" }]);
    expect(state!.measurements).toHaveLength(1);
    expect(state!.dailyLog).toHaveLength(1);
    expect(state!.monthlyPlan).not.toBeNull();
    expect(state!.workoutTemplates).toHaveLength(1);
  });

  it("tolerates missing optional cache slots", () => {
    mockRegistered.mockReturnValue(true);
    mockCache.mockReturnValue({
      workouts: [],
      customExercises: [],
      measurements: [],
    });
    const state = peekFizrukDualWriteState();
    expect(state!.dailyLog).toEqual([]);
    expect(state!.monthlyPlan).toBeNull();
    expect(state!.workoutTemplates).toEqual([]);
  });
});

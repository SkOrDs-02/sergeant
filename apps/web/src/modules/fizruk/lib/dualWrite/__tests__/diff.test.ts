import { describe, it, expect } from "vitest";

import {
  diffFizrukDualWriteOps,
  type FizrukDualWriteState,
  type FizrukWorkoutSnapshot,
  type FizrukCustomExerciseSnapshot,
  type FizrukMeasurementSnapshot,
  type FizrukDailyLogSnapshot,
  type FizrukMonthlyPlanSnapshot,
  type FizrukWorkoutTemplateSnapshot,
} from "../diff.js";

const EMPTY: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  measurements: [],
  dailyLog: [],
  monthlyPlan: null,
  workoutTemplates: [],
};

function makeWorkout(
  overrides: Partial<FizrukWorkoutSnapshot> = {},
): FizrukWorkoutSnapshot {
  return {
    id: "w1",
    startedAt: "2026-05-01T10:00:00Z",
    endedAt: null,
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
    ...overrides,
  };
}

function makeExercise(id = "ex1"): FizrukCustomExerciseSnapshot {
  return { id, nameUk: "Присідання", primaryGroup: "legs" };
}

function makeMeasurement(id = "m1"): FizrukMeasurementSnapshot {
  return { id, at: "2026-05-01T08:00:00Z", weightKg: 80 };
}

describe("diffFizrukDualWriteOps", () => {
  it("returns empty when both states are empty", () => {
    expect(diffFizrukDualWriteOps(EMPTY, EMPTY)).toEqual([]);
  });

  it("returns empty when same reference is passed", () => {
    const state: FizrukDualWriteState = {
      workouts: [makeWorkout()],
      customExercises: [],
      measurements: [],
      dailyLog: [],
      monthlyPlan: null,
      workoutTemplates: [],
    };
    expect(diffFizrukDualWriteOps(state, state)).toEqual([]);
  });

  // --- Workouts ---

  it("detects workout add", () => {
    const w = makeWorkout();
    const next: FizrukDualWriteState = { ...EMPTY, workouts: [w] };
    const ops = diffFizrukDualWriteOps(EMPTY, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "workout-upsert", workout: w });
  });

  it("detects workout delete", () => {
    const w = makeWorkout();
    const prev: FizrukDualWriteState = { ...EMPTY, workouts: [w] };
    const ops = diffFizrukDualWriteOps(prev, EMPTY);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "workout-delete", workoutId: "w1" });
  });

  it("detects workout update (endedAt changed)", () => {
    const w1 = makeWorkout();
    const w2 = makeWorkout({ endedAt: "2026-05-01T11:00:00Z" });
    const prev: FizrukDualWriteState = { ...EMPTY, workouts: [w1] };
    const next: FizrukDualWriteState = { ...EMPTY, workouts: [w2] };
    const ops = diffFizrukDualWriteOps(prev, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "workout-upsert", workout: w2 });
  });

  it("skips workout when same reference (no change)", () => {
    const w = makeWorkout();
    const prev: FizrukDualWriteState = { ...EMPTY, workouts: [w] };
    const next: FizrukDualWriteState = { ...EMPTY, workouts: [w] };
    expect(diffFizrukDualWriteOps(prev, next)).toEqual([]);
  });

  // --- Custom exercises ---

  it("detects custom exercise add", () => {
    const ex = makeExercise();
    const next: FizrukDualWriteState = { ...EMPTY, customExercises: [ex] };
    const ops = diffFizrukDualWriteOps(EMPTY, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "custom-exercise-upsert", exercise: ex });
  });

  it("detects custom exercise delete", () => {
    const ex = makeExercise();
    const prev: FizrukDualWriteState = { ...EMPTY, customExercises: [ex] };
    const ops = diffFizrukDualWriteOps(prev, EMPTY);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      kind: "custom-exercise-delete",
      exerciseId: "ex1",
    });
  });

  // --- Measurements ---

  it("detects measurement add", () => {
    const m = makeMeasurement();
    const next: FizrukDualWriteState = { ...EMPTY, measurements: [m] };
    const ops = diffFizrukDualWriteOps(EMPTY, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "measurement-upsert", measurement: m });
  });

  it("detects measurement delete", () => {
    const m = makeMeasurement();
    const prev: FizrukDualWriteState = { ...EMPTY, measurements: [m] };
    const ops = diffFizrukDualWriteOps(prev, EMPTY);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "measurement-delete", measurementId: "m1" });
  });

  // --- Mixed ---

  it("handles multiple changes across entity types", () => {
    const w = makeWorkout();
    const ex = makeExercise();
    const m = makeMeasurement();

    const prev: FizrukDualWriteState = {
      workouts: [w],
      customExercises: [ex],
      measurements: [],
      dailyLog: [],
      monthlyPlan: null,
      workoutTemplates: [],
    };
    const next: FizrukDualWriteState = {
      workouts: [],
      customExercises: [ex],
      measurements: [m],
      dailyLog: [],
      monthlyPlan: null,
      workoutTemplates: [],
    };
    const ops = diffFizrukDualWriteOps(prev, next);
    // workout-delete + measurement-upsert (exercise is same ref → no op)
    expect(ops).toHaveLength(2);
    expect(ops[0]!.kind).toBe("workout-delete");
    expect(ops[1]!.kind).toBe("measurement-upsert");
  });

  it("sorts ops by id within each entity type", () => {
    const w1 = makeWorkout({ id: "w2" });
    const w2 = makeWorkout({ id: "w1" });
    const next: FizrukDualWriteState = { ...EMPTY, workouts: [w1, w2] };
    const ops = diffFizrukDualWriteOps(EMPTY, next);
    expect(ops).toHaveLength(2);
    // Sorted by id ascending
    expect((ops[0] as { workout: { id: string } }).workout.id).toBe("w1");
    expect((ops[1] as { workout: { id: string } }).workout.id).toBe("w2");
  });

  // --- Daily log (Stage 12) ---

  it("detects daily-log add", () => {
    const e = makeDailyLog();
    const next: FizrukDualWriteState = { ...EMPTY, dailyLog: [e] };
    const ops = diffFizrukDualWriteOps(EMPTY, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "daily-log-upsert", entry: e });
  });

  it("detects daily-log delete", () => {
    const e = makeDailyLog();
    const prev: FizrukDualWriteState = { ...EMPTY, dailyLog: [e] };
    const ops = diffFizrukDualWriteOps(prev, EMPTY);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "daily-log-delete", entryId: "d1" });
  });

  it("detects daily-log update (mood changed)", () => {
    const e1 = makeDailyLog({ mood: 3 });
    const e2 = makeDailyLog({ mood: 5 });
    const prev: FizrukDualWriteState = { ...EMPTY, dailyLog: [e1] };
    const next: FizrukDualWriteState = { ...EMPTY, dailyLog: [e2] };
    const ops = diffFizrukDualWriteOps(prev, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "daily-log-upsert", entry: e2 });
  });

  it("skips daily-log when fields equal", () => {
    const e1 = makeDailyLog();
    const e2 = makeDailyLog();
    const prev: FizrukDualWriteState = { ...EMPTY, dailyLog: [e1] };
    const next: FizrukDualWriteState = { ...EMPTY, dailyLog: [e2] };
    expect(diffFizrukDualWriteOps(prev, next)).toEqual([]);
  });

  // --- Monthly plan (Stage 12) ---

  it("emits monthly-plan-set when plan changes from null to non-null", () => {
    const plan: FizrukMonthlyPlanSnapshot = {
      dataJson: '{"reminderEnabled":true}',
    };
    const next: FizrukDualWriteState = { ...EMPTY, monthlyPlan: plan };
    const ops = diffFizrukDualWriteOps(EMPTY, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "monthly-plan-set", monthlyPlan: plan });
  });

  it("skips monthly-plan when JSON unchanged across reference change", () => {
    const a: FizrukMonthlyPlanSnapshot = { dataJson: '{"x":1}' };
    const b: FizrukMonthlyPlanSnapshot = { dataJson: '{"x":1}' };
    const prev: FizrukDualWriteState = { ...EMPTY, monthlyPlan: a };
    const next: FizrukDualWriteState = { ...EMPTY, monthlyPlan: b };
    expect(diffFizrukDualWriteOps(prev, next)).toEqual([]);
  });

  it("emits monthly-plan-set when JSON differs", () => {
    const a: FizrukMonthlyPlanSnapshot = { dataJson: '{"x":1}' };
    const b: FizrukMonthlyPlanSnapshot = { dataJson: '{"x":2}' };
    const prev: FizrukDualWriteState = { ...EMPTY, monthlyPlan: a };
    const next: FizrukDualWriteState = { ...EMPTY, monthlyPlan: b };
    const ops = diffFizrukDualWriteOps(prev, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "monthly-plan-set", monthlyPlan: b });
  });

  it("does not emit monthly-plan delete when set back to null", () => {
    const plan: FizrukMonthlyPlanSnapshot = { dataJson: "{}" };
    const prev: FizrukDualWriteState = { ...EMPTY, monthlyPlan: plan };
    expect(diffFizrukDualWriteOps(prev, EMPTY)).toEqual([]);
  });

  // --- Workout templates (Stage 12) ---

  it("detects workout-template add", () => {
    const t = makeTemplate();
    const next: FizrukDualWriteState = { ...EMPTY, workoutTemplates: [t] };
    const ops = diffFizrukDualWriteOps(EMPTY, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "workout-template-upsert", template: t });
  });

  it("detects workout-template delete", () => {
    const t = makeTemplate();
    const prev: FizrukDualWriteState = { ...EMPTY, workoutTemplates: [t] };
    const ops = diffFizrukDualWriteOps(prev, EMPTY);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      kind: "workout-template-delete",
      templateId: "t1",
    });
  });

  it("detects workout-template update (name changed)", () => {
    const t1 = makeTemplate({ name: "Push" });
    const t2 = makeTemplate({ name: "Pull" });
    const prev: FizrukDualWriteState = { ...EMPTY, workoutTemplates: [t1] };
    const next: FizrukDualWriteState = { ...EMPTY, workoutTemplates: [t2] };
    const ops = diffFizrukDualWriteOps(prev, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "workout-template-upsert", template: t2 });
  });
});

function makeDailyLog(
  overrides: Partial<FizrukDailyLogSnapshot> = {},
): FizrukDailyLogSnapshot {
  return {
    id: "d1",
    at: "2026-05-01T07:00:00Z",
    weightKg: 80,
    sleepHours: 7.5,
    energyLevel: 7,
    mood: 4,
    note: "",
    ...overrides,
  };
}

function makeTemplate(
  overrides: Partial<FizrukWorkoutTemplateSnapshot> = {},
): FizrukWorkoutTemplateSnapshot {
  return {
    id: "t1",
    name: "Push day",
    exerciseIds: ["bench-press"],
    groups: [],
    updatedAt: "2026-05-01T10:00:00Z",
    ...overrides,
  };
}

import { describe, it, expect } from "vitest";

import {
  diffFizrukDualWriteOps,
  type FizrukDualWriteState,
  type FizrukWorkoutSnapshot,
  type FizrukCustomExerciseSnapshot,
  type FizrukMeasurementSnapshot,
} from "../diff.js";

const EMPTY: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  measurements: [],
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
    };
    const next: FizrukDualWriteState = {
      workouts: [],
      customExercises: [ex],
      measurements: [m],
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
});

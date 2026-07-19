import { describe, it, expect } from "vitest";
import { diffWorkoutsOps, type FizrukWorkoutSnapshot } from "./workouts";

const ITEMS = [
  {
    id: "i1",
    exerciseId: "bench-press",
    nameUk: "Жим лежачи",
    primaryGroup: "chest",
    musclesPrimary: ["chest"],
    musclesSecondary: ["triceps"],
    type: "strength",
  },
];
const GROUPS = [{ id: "g1", itemIds: ["i1"] }];
const WARMUP = [{ id: "w1", done: false, label: "Розминка" }];
const COOLDOWN = [{ id: "c1", done: false, label: "Заминка" }];
const WELLBEING = { energy: 3, mood: 4 };

function baseWorkout(
  overrides: Partial<FizrukWorkoutSnapshot> = {},
): FizrukWorkoutSnapshot {
  return {
    id: "w1",
    startedAt: "2026-07-01T10:00:00.000Z",
    endedAt: null,
    items: ITEMS,
    groups: GROUPS,
    warmup: WARMUP,
    cooldown: COOLDOWN,
    note: "",
    wellbeing: WELLBEING,
    ...overrides,
  };
}

describe("diffWorkoutsOps", () => {
  it("emits a workout-upsert for a workout new to next", () => {
    const ops = diffWorkoutsOps([], [baseWorkout()]);
    expect(ops).toEqual([{ kind: "workout-upsert", workout: baseWorkout() }]);
  });

  it("emits a workout-delete for a workout missing from next", () => {
    const ops = diffWorkoutsOps([baseWorkout()], []);
    expect(ops).toEqual([{ kind: "workout-delete", workoutId: "w1" }]);
  });

  it("emits no ops when the reference is identical", () => {
    const w = baseWorkout();
    expect(diffWorkoutsOps([w], [w])).toEqual([]);
  });

  it("emits no ops when the reference differs but every field is unchanged", () => {
    const prev = baseWorkout();
    const next = baseWorkout();
    expect(diffWorkoutsOps([prev], [next])).toEqual([]);
  });

  it("emits an upsert when only startedAt differs", () => {
    const prev = baseWorkout();
    const next = baseWorkout({ startedAt: "2026-07-01T11:00:00.000Z" });
    expect(diffWorkoutsOps([prev], [next])).toEqual([
      { kind: "workout-upsert", workout: next },
    ]);
  });

  it("emits an upsert when only endedAt differs", () => {
    const prev = baseWorkout();
    const next = baseWorkout({ endedAt: "2026-07-01T12:00:00.000Z" });
    expect(diffWorkoutsOps([prev], [next])).toEqual([
      { kind: "workout-upsert", workout: next },
    ]);
  });

  it("emits an upsert when only note differs", () => {
    const prev = baseWorkout();
    const next = baseWorkout({ note: "Гарне тренування" });
    expect(diffWorkoutsOps([prev], [next])).toEqual([
      { kind: "workout-upsert", workout: next },
    ]);
  });

  it("emits an upsert when only items' reference differs", () => {
    const prev = baseWorkout();
    const next = baseWorkout({ items: [...ITEMS] });
    expect(diffWorkoutsOps([prev], [next])).toEqual([
      { kind: "workout-upsert", workout: next },
    ]);
  });

  it("emits an upsert when only groups' reference differs", () => {
    const prev = baseWorkout();
    const next = baseWorkout({ groups: [...GROUPS] });
    expect(diffWorkoutsOps([prev], [next])).toEqual([
      { kind: "workout-upsert", workout: next },
    ]);
  });

  it("emits an upsert when only warmup's reference differs", () => {
    const prev = baseWorkout();
    const next = baseWorkout({ warmup: [...WARMUP] });
    expect(diffWorkoutsOps([prev], [next])).toEqual([
      { kind: "workout-upsert", workout: next },
    ]);
  });

  it("emits an upsert when only cooldown's reference differs", () => {
    const prev = baseWorkout();
    const next = baseWorkout({ cooldown: [...COOLDOWN] });
    expect(diffWorkoutsOps([prev], [next])).toEqual([
      { kind: "workout-upsert", workout: next },
    ]);
  });

  it("emits an upsert when only wellbeing's reference differs", () => {
    const prev = baseWorkout();
    const next = baseWorkout({ wellbeing: { ...WELLBEING } });
    expect(diffWorkoutsOps([prev], [next])).toEqual([
      { kind: "workout-upsert", workout: next },
    ]);
  });
});

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

  it("emits no ops when items is a new object with the same content", () => {
    const prev = baseWorkout();
    const next = baseWorkout({ items: [...ITEMS] });
    expect(diffWorkoutsOps([prev], [next])).toEqual([]);
  });

  it("emits no ops when groups is a new object with the same content", () => {
    const prev = baseWorkout();
    const next = baseWorkout({ groups: [...GROUPS] });
    expect(diffWorkoutsOps([prev], [next])).toEqual([]);
  });

  it("emits no ops when warmup is a new object with the same content", () => {
    const prev = baseWorkout();
    const next = baseWorkout({ warmup: [...WARMUP] });
    expect(diffWorkoutsOps([prev], [next])).toEqual([]);
  });

  it("emits no ops when cooldown is a new object with the same content", () => {
    const prev = baseWorkout();
    const next = baseWorkout({ cooldown: [...COOLDOWN] });
    expect(diffWorkoutsOps([prev], [next])).toEqual([]);
  });

  it("emits no ops when wellbeing is a new object with the same content", () => {
    const prev = baseWorkout();
    const next = baseWorkout({ wellbeing: { ...WELLBEING } });
    expect(diffWorkoutsOps([prev], [next])).toEqual([]);
  });

  it("emits an upsert (and preserves group type/restSec) when only the group's restSec changes", () => {
    const prev = baseWorkout({
      groups: [{ id: "g1", itemIds: ["i1"], type: "circuit", restSec: 60 }],
    });
    const next = baseWorkout({
      groups: [{ id: "g1", itemIds: ["i1"], type: "circuit", restSec: 90 }],
    });
    expect(diffWorkoutsOps([prev], [next])).toEqual([
      { kind: "workout-upsert", workout: next },
    ]);
    expect(next.groups[0]).toEqual({
      id: "g1",
      itemIds: ["i1"],
      type: "circuit",
      restSec: 90,
    });
  });

  it("emits an upsert when only kcalBurned differs", () => {
    const prev = baseWorkout({ kcalBurned: null });
    const next = baseWorkout({ kcalBurned: 320 });
    expect(diffWorkoutsOps([prev], [next])).toEqual([
      { kind: "workout-upsert", workout: next },
    ]);
  });

  it("treats a missing kcalBurned and null as the same value", () => {
    const prev = baseWorkout();
    const next = baseWorkout({ kcalBurned: null });
    expect(diffWorkoutsOps([prev], [next])).toEqual([]);
  });

  it("emits an upsert when a set's weight changes inside a cloned items array", () => {
    const withSets = (weightKg: number) =>
      baseWorkout({
        items: [{ ...ITEMS[0]!, sets: [{ weightKg, reps: 5, rpe: 8 }] }],
      });
    const prev = withSets(50);
    const next = withSets(55);
    expect(diffWorkoutsOps([prev], [next])).toEqual([
      { kind: "workout-upsert", workout: next },
    ]);
  });

  it("emits an upsert when an item is removed or the order of items changes", () => {
    const second = { ...ITEMS[0]!, id: "i2", exerciseId: "squat" };
    const prev = baseWorkout({ items: [ITEMS[0]!, second] });
    expect(
      diffWorkoutsOps([prev], [baseWorkout({ items: [ITEMS[0]!] })]),
    ).toHaveLength(1);
    expect(
      diffWorkoutsOps([prev], [baseWorkout({ items: [second, ITEMS[0]!] })]),
    ).toHaveLength(1);
  });

  it("emits an upsert when warmup or wellbeing flips between null and a value", () => {
    expect(
      diffWorkoutsOps([baseWorkout()], [baseWorkout({ warmup: null })]),
    ).toHaveLength(1);
    expect(
      diffWorkoutsOps([baseWorkout()], [baseWorkout({ wellbeing: null })]),
    ).toHaveLength(1);
    expect(
      diffWorkoutsOps([baseWorkout({ wellbeing: null })], [baseWorkout()]),
    ).toHaveLength(1);
  });

  it("treats an undefined optional key as absent but a defined extra key as a change", () => {
    const prev = baseWorkout({
      items: [{ ...ITEMS[0]!, sets: [{ weightKg: 50, reps: 5 }] }],
    });
    const same = baseWorkout({
      items: [
        {
          ...ITEMS[0]!,
          // exactOptionalPropertyTypes забороняє літерал `rpe: undefined`.
          sets: [{ weightKg: 50, reps: 5, rpe: undefined } as never],
        },
      ],
    });
    const changed = baseWorkout({
      items: [{ ...ITEMS[0]!, sets: [{ weightKg: 50, reps: 5, rpe: 9 }] }],
    });
    expect(diffWorkoutsOps([prev], [same])).toEqual([]);
    expect(diffWorkoutsOps([prev], [changed])).toHaveLength(1);
  });
});

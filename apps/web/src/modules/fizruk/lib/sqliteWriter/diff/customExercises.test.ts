import { describe, it, expect } from "vitest";
import {
  diffCustomExercisesOps,
  type FizrukCustomExerciseSnapshot,
} from "./customExercises";

function baseExercise(
  overrides: Partial<FizrukCustomExerciseSnapshot> = {},
): FizrukCustomExerciseSnapshot {
  return { id: "ex1", nameUk: "Моя вправа", ...overrides };
}

describe("diffCustomExercisesOps", () => {
  it("emits a custom-exercise-upsert for an exercise new to next", () => {
    const ops = diffCustomExercisesOps([], [baseExercise()]);
    expect(ops).toEqual([
      { kind: "custom-exercise-upsert", exercise: baseExercise() },
    ]);
  });

  it("emits a custom-exercise-delete for an exercise missing from next", () => {
    const ops = diffCustomExercisesOps([baseExercise()], []);
    expect(ops).toEqual([
      { kind: "custom-exercise-delete", exerciseId: "ex1" },
    ]);
  });

  it("emits no op when the reference is identical", () => {
    const e = baseExercise();
    expect(diffCustomExercisesOps([e], [e])).toEqual([]);
  });

  it("always upserts on reference change, even with identical field values (JSON blob semantics)", () => {
    const ops = diffCustomExercisesOps([baseExercise()], [baseExercise()]);
    expect(ops).toEqual([
      { kind: "custom-exercise-upsert", exercise: baseExercise() },
    ]);
  });
});

import { describe, it, expect } from "vitest";
import {
  diffWorkoutTemplatesOps,
  type FizrukWorkoutTemplateSnapshot,
} from "./workoutTemplates";

const EXERCISE_IDS = ["bench-press", "squat"];
const GROUPS = [{ id: "g1" }];

function baseTemplate(
  overrides: Partial<FizrukWorkoutTemplateSnapshot> = {},
): FizrukWorkoutTemplateSnapshot {
  return {
    id: "tpl1",
    name: "Push day",
    exerciseIds: EXERCISE_IDS,
    groups: GROUPS,
    updatedAt: "2026-07-01T10:00:00.000Z",
    lastUsedAt: null,
    ...overrides,
  };
}

describe("diffWorkoutTemplatesOps", () => {
  it("emits a workout-template-upsert for a template new to next", () => {
    const ops = diffWorkoutTemplatesOps([], [baseTemplate()]);
    expect(ops).toEqual([
      { kind: "workout-template-upsert", template: baseTemplate() },
    ]);
  });

  it("emits a workout-template-delete for a template missing from next", () => {
    const ops = diffWorkoutTemplatesOps([baseTemplate()], []);
    expect(ops).toEqual([
      { kind: "workout-template-delete", templateId: "tpl1" },
    ]);
  });

  it("emits no ops when the reference is identical", () => {
    const t = baseTemplate();
    expect(diffWorkoutTemplatesOps([t], [t])).toEqual([]);
  });

  it("emits no ops when the reference differs but every field is unchanged", () => {
    expect(diffWorkoutTemplatesOps([baseTemplate()], [baseTemplate()])).toEqual(
      [],
    );
  });

  it("emits an upsert when only name differs", () => {
    const prev = baseTemplate();
    const next = baseTemplate({ name: "Pull day" });
    expect(diffWorkoutTemplatesOps([prev], [next])).toEqual([
      { kind: "workout-template-upsert", template: next },
    ]);
  });

  it("emits an upsert when only exerciseIds' reference differs", () => {
    const prev = baseTemplate();
    const next = baseTemplate({ exerciseIds: [...EXERCISE_IDS] });
    expect(diffWorkoutTemplatesOps([prev], [next])).toEqual([
      { kind: "workout-template-upsert", template: next },
    ]);
  });

  it("emits an upsert when only groups' reference differs", () => {
    const prev = baseTemplate();
    const next = baseTemplate({ groups: [...GROUPS] });
    expect(diffWorkoutTemplatesOps([prev], [next])).toEqual([
      { kind: "workout-template-upsert", template: next },
    ]);
  });

  it("emits an upsert when only updatedAt differs", () => {
    const prev = baseTemplate();
    const next = baseTemplate({ updatedAt: "2026-07-02T10:00:00.000Z" });
    expect(diffWorkoutTemplatesOps([prev], [next])).toEqual([
      { kind: "workout-template-upsert", template: next },
    ]);
  });

  it("emits an upsert when lastUsedAt changes from null to a timestamp", () => {
    const prev = baseTemplate();
    const next = baseTemplate({ lastUsedAt: "2026-07-01T12:00:00.000Z" });
    expect(diffWorkoutTemplatesOps([prev], [next])).toEqual([
      { kind: "workout-template-upsert", template: next },
    ]);
  });

  it("treats undefined and null lastUsedAt as equivalent (no op)", () => {
    // lastUsedAt is typed `string | null`; guard that a runtime `undefined`
    // (e.g. an older snapshot missing the field) still diffs equal to null.
    const prev = {
      ...baseTemplate(),
      lastUsedAt: undefined,
    } as unknown as FizrukWorkoutTemplateSnapshot;
    const next = baseTemplate({ lastUsedAt: null });
    expect(diffWorkoutTemplatesOps([prev], [next])).toEqual([]);
  });
});

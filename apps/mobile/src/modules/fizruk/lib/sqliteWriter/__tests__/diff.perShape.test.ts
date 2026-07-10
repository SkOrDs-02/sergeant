/**
 * Per-shape unit tests added alongside the P2.2a module-folder
 * decomposition (audit `docs/audits/2026-05-13-mobile-reliability-ux-roast.md`).
 *
 * The orchestrator coverage lives in the sibling `diff.test.ts`
 * (full happy-path + cold-cache + LWW semantics across all 10
 * shapes). This file validates the per-shape diff functions in
 * isolation so a future regression in any single helper trips a
 * narrow signal instead of just the top-level orchestrator suite.
 *
 * Minimum bar: 1 happy-path + 1 edge case per shape.
 */

import { diffActiveWorkoutOps } from "../diff/activeWorkout";
import { diffCustomExercisesOps } from "../diff/customExercises";
import { diffDailyLogOps } from "../diff/dailyLog";
import { diffMeasurementsOps } from "../diff/measurements";
import { diffMonthlyPlanOps } from "../diff/monthlyPlan";
import { diffPlanTemplateOps } from "../diff/planTemplate";
import { diffProgramsOps } from "../diff/programs";
import { diffWellbeingOps } from "../diff/wellbeing";
import { diffWorkoutTemplatesOps } from "../diff/workoutTemplates";
import { diffWorkoutsOps } from "../diff/workouts";

import type { FizrukWorkoutSnapshot } from "../diff/workouts";

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

describe("diffWorkoutsOps", () => {
  it("emits upsert for a new workout and delete for a missing one", () => {
    const ops = diffWorkoutsOps(
      [makeWorkout({ id: "w1" })],
      [makeWorkout({ id: "w2" })],
    );
    expect(ops).toEqual([
      {
        kind: "workout-upsert",
        workout: expect.objectContaining({ id: "w2" }),
      },
      { kind: "workout-delete", workoutId: "w1" },
    ]);
  });

  it("does not emit when only an `extra` field (outside the equality set) changes", () => {
    const baseline = makeWorkout({ id: "w1" });
    const ops = diffWorkoutsOps(
      [baseline],
      [
        // `extra` is part of the index signature on `FizrukWorkoutSnapshot`
        // but is intentionally NOT consulted by the diff (the workout
        // hook keeps unknown fields on the snapshot as a passthrough).
        { ...baseline, foo: "bar" } as FizrukWorkoutSnapshot,
      ],
    );
    expect(ops).toEqual([]);
  });
});

describe("diffCustomExercisesOps", () => {
  it("emits an upsert for any present custom exercise (no equality check)", () => {
    const ops = diffCustomExercisesOps(
      [{ id: "ex-1", payload: 1 }],
      [{ id: "ex-1", payload: 2 }],
    );
    expect(ops).toEqual([
      { kind: "custom-exercise-upsert", exercise: { id: "ex-1", payload: 2 } },
    ]);
  });

  it("emits a delete when the row disappears", () => {
    const ops = diffCustomExercisesOps([{ id: "ex-1" }], []);
    expect(ops).toEqual([
      { kind: "custom-exercise-delete", exerciseId: "ex-1" },
    ]);
  });
});

describe("diffMeasurementsOps", () => {
  it("treats any presence as an upsert (hook owns the freshness contract)", () => {
    const ops = diffMeasurementsOps(
      [{ id: "m1", at: "2026-05-01" }],
      [{ id: "m1", at: "2026-05-01", weightKg: 80 }],
    );
    expect(ops).toEqual([
      {
        kind: "measurement-upsert",
        measurement: { id: "m1", at: "2026-05-01", weightKg: 80 },
      },
    ]);
  });

  it("emits a delete on removal", () => {
    const ops = diffMeasurementsOps([{ id: "m1", at: "2026-05-01" }], []);
    expect(ops).toEqual([{ kind: "measurement-delete", measurementId: "m1" }]);
  });
});

describe("diffDailyLogOps", () => {
  it("emits an upsert when a scalar field actually changes", () => {
    const ops = diffDailyLogOps(
      [
        {
          id: "d1",
          at: "2026-05-01T08:00:00Z",
          weightKg: 80,
          sleepHours: 7,
          energyLevel: 4,
          mood: 4,
          note: "",
        },
      ],
      [
        {
          id: "d1",
          at: "2026-05-01T08:00:00Z",
          weightKg: 81, // <-- only this differs
          sleepHours: 7,
          energyLevel: 4,
          mood: 4,
          note: "",
        },
      ],
    );
    expect(ops).toEqual([
      {
        kind: "daily-log-upsert",
        entry: expect.objectContaining({ id: "d1", weightKg: 81 }),
      },
    ]);
  });

  it("returns [] when prev/next are both undefined (cold-cache caller)", () => {
    expect(diffDailyLogOps(undefined, undefined)).toEqual([]);
  });
});

describe("diffMonthlyPlanOps", () => {
  it("emits monthly-plan-set when the payload differs", () => {
    const ops = diffMonthlyPlanOps(
      { dataJson: "{}" },
      { dataJson: '{"foo":1}' },
    );
    expect(ops).toEqual([
      { kind: "monthly-plan-set", monthlyPlan: { dataJson: '{"foo":1}' } },
    ]);
  });

  it("no-ops when next is null even if prev was set (table has no soft-delete column)", () => {
    expect(diffMonthlyPlanOps({ dataJson: '{"foo":1}' }, null)).toEqual([]);
  });
});

describe("diffWorkoutTemplatesOps", () => {
  it("emits an upsert when updatedAt advances (LWW guard)", () => {
    const ops = diffWorkoutTemplatesOps(
      [
        {
          id: "t1",
          name: "Push",
          exerciseIds: ["a"],
          groups: [],
          updatedAt: "2026-05-01T00:00:00Z",
        },
      ],
      [
        {
          id: "t1",
          name: "Push",
          exerciseIds: ["a"],
          groups: [],
          updatedAt: "2026-05-02T00:00:00Z",
        },
      ],
    );
    expect(ops).toEqual([
      {
        kind: "workout-template-upsert",
        template: expect.objectContaining({ id: "t1" }),
      },
    ]);
  });

  it("treats undefined inputs as empty arrays", () => {
    expect(diffWorkoutTemplatesOps(undefined, undefined)).toEqual([]);
  });
});

describe("diffProgramsOps", () => {
  it("emits programs-set when activeProgramId changes", () => {
    const ops = diffProgramsOps(
      { activeProgramId: "p1" },
      { activeProgramId: "p2" },
    );
    expect(ops).toEqual([
      { kind: "programs-set", programs: { activeProgramId: "p2" } },
    ]);
  });

  it("treats null on next as cold cache (no-op even when prev was set)", () => {
    expect(diffProgramsOps({ activeProgramId: "p1" }, null)).toEqual([]);
  });
});

describe("diffPlanTemplateOps", () => {
  it("emits plan-template-set when the JSON payload differs", () => {
    const ops = diffPlanTemplateOps(
      { dataJson: "null" },
      { dataJson: '{"x":1}' },
    );
    expect(ops).toEqual([
      { kind: "plan-template-set", planTemplate: { dataJson: '{"x":1}' } },
    ]);
  });

  it("no-ops when the dataJson is byte-equal", () => {
    expect(
      diffPlanTemplateOps({ dataJson: '{"x":1}' }, { dataJson: '{"x":1}' }),
    ).toEqual([]);
  });
});

describe("diffWellbeingOps", () => {
  it("emits an upsert when the snapshot scalar changes", () => {
    const baseline = {
      dateKey: "2026-05-01",
      mood: 3,
      energy: 3,
      sleepQuality: 3,
      sleepHours: 7,
      notes: "",
      updatedAt: "2026-05-01T08:00:00Z",
    };
    const ops = diffWellbeingOps([baseline], [{ ...baseline, mood: 4 }]);
    expect(ops).toEqual([
      {
        kind: "wellbeing-upsert",
        entry: expect.objectContaining({ dateKey: "2026-05-01", mood: 4 }),
      },
    ]);
  });

  it("emits a delete keyed by `dateKey` when the row disappears", () => {
    const ops = diffWellbeingOps(
      [
        {
          dateKey: "2026-05-01",
          mood: 3,
          energy: 3,
          sleepQuality: 3,
          sleepHours: 7,
          notes: "",
          updatedAt: "2026-05-01T08:00:00Z",
        },
      ],
      [],
    );
    expect(ops).toEqual([{ kind: "wellbeing-delete", dateKey: "2026-05-01" }]);
  });
});

describe("diffActiveWorkoutOps", () => {
  it("emits active-workout-set when the slot becomes filled", () => {
    const ops = diffActiveWorkoutOps(
      { activeWorkoutId: null },
      { activeWorkoutId: "w-123" },
    );
    expect(ops).toEqual([
      {
        kind: "active-workout-set",
        activeWorkout: { activeWorkoutId: "w-123" },
      },
    ]);
  });

  it("treats null on next as cold cache (no-op)", () => {
    expect(diffActiveWorkoutOps({ activeWorkoutId: "w-123" }, null)).toEqual(
      [],
    );
  });
});

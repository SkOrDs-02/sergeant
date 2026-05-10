/**
 * Mobile mirror of `apps/web/src/modules/fizruk/lib/dualWrite/__tests__/diff.test.ts`.
 *
 * Pure-function diff has no platform-specific behaviour, so the
 * cases mirror the web spec exactly (jest assertion API, no Vitest).
 *
 * **Stage 12 / PR #070f-mobile-dualwrite** — extends the diff
 * coverage from the original three classes (workouts, custom
 * exercises, measurements) to the full six classes shipped on web.
 *
 * **Stage 12.5 / PR #070f2-mobile-dualwrite** — covers the three
 * remaining mobile-only entity classes (programs, plan-template,
 * wellbeing) added by the same PR.
 */
import {
  diffFizrukDualWriteOps,
  type FizrukCustomExerciseSnapshot,
  type FizrukDailyLogSnapshot,
  type FizrukDualWriteState,
  type FizrukMeasurementSnapshot,
  type FizrukMonthlyPlanSnapshot,
  type FizrukPlanTemplateSnapshot,
  type FizrukProgramsSnapshot,
  type FizrukWellbeingSnapshot,
  type FizrukWorkoutSnapshot,
  type FizrukWorkoutTemplateSnapshot,
} from "../diff";

const EMPTY: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  measurements: [],
  dailyLog: [],
  monthlyPlan: null,
  workoutTemplates: [],
  programs: null,
  planTemplate: null,
  wellbeing: [],
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

function makeWellbeing(
  overrides: Partial<FizrukWellbeingSnapshot> = {},
): FizrukWellbeingSnapshot {
  return {
    dateKey: "2026-05-01",
    mood: 4,
    energy: 3,
    sleepQuality: 4,
    sleepHours: 7.5,
    notes: "",
    updatedAt: "2026-05-01T07:00:00Z",
    ...overrides,
  };
}

describe("diffFizrukDualWriteOps (mobile)", () => {
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

  it("detects workout-template update (lastUsedAt changed)", () => {
    const t1 = makeTemplate({ lastUsedAt: null });
    const t2 = makeTemplate({ lastUsedAt: "2026-05-02T10:00:00Z" });
    const prev: FizrukDualWriteState = { ...EMPTY, workoutTemplates: [t1] };
    const next: FizrukDualWriteState = { ...EMPTY, workoutTemplates: [t2] };
    const ops = diffFizrukDualWriteOps(prev, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "workout-template-upsert", template: t2 });
  });

  // --- Mixed ---

  it("handles changes across all six entity classes in one diff", () => {
    const w = makeWorkout();
    const ex = makeExercise();
    const m = makeMeasurement();
    const d = makeDailyLog();
    const plan: FizrukMonthlyPlanSnapshot = { dataJson: '{"x":1}' };
    const t = makeTemplate();

    const ops = diffFizrukDualWriteOps(EMPTY, {
      workouts: [w],
      customExercises: [ex],
      measurements: [m],
      dailyLog: [d],
      monthlyPlan: plan,
      workoutTemplates: [t],
    });
    const kinds = ops.map((o) => o.kind).sort();
    expect(kinds).toEqual(
      [
        "custom-exercise-upsert",
        "daily-log-upsert",
        "measurement-upsert",
        "monthly-plan-set",
        "workout-template-upsert",
        "workout-upsert",
      ].sort(),
    );
  });

  // --- Programs (Stage 12.5) ---

  it("emits programs-set when active id changes from null to non-null", () => {
    const programs: FizrukProgramsSnapshot = { activeProgramId: "prog-1" };
    const next: FizrukDualWriteState = { ...EMPTY, programs };
    const ops = diffFizrukDualWriteOps(EMPTY, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "programs-set", programs });
  });

  it("emits programs-set when active id changes", () => {
    const a: FizrukProgramsSnapshot = { activeProgramId: "prog-1" };
    const b: FizrukProgramsSnapshot = { activeProgramId: "prog-2" };
    const prev: FizrukDualWriteState = { ...EMPTY, programs: a };
    const next: FizrukDualWriteState = { ...EMPTY, programs: b };
    const ops = diffFizrukDualWriteOps(prev, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "programs-set", programs: b });
  });

  it("emits programs-set when clearing the active program (id → null)", () => {
    const a: FizrukProgramsSnapshot = { activeProgramId: "prog-1" };
    const b: FizrukProgramsSnapshot = { activeProgramId: null };
    const prev: FizrukDualWriteState = { ...EMPTY, programs: a };
    const next: FizrukDualWriteState = { ...EMPTY, programs: b };
    const ops = diffFizrukDualWriteOps(prev, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "programs-set", programs: b });
  });

  it("skips programs when active id unchanged across reference change", () => {
    const a: FizrukProgramsSnapshot = { activeProgramId: "prog-1" };
    const b: FizrukProgramsSnapshot = { activeProgramId: "prog-1" };
    const prev: FizrukDualWriteState = { ...EMPTY, programs: a };
    const next: FizrukDualWriteState = { ...EMPTY, programs: b };
    expect(diffFizrukDualWriteOps(prev, next)).toEqual([]);
  });

  it("does not emit a programs op when next.programs is null (cold cache)", () => {
    const a: FizrukProgramsSnapshot = { activeProgramId: "prog-1" };
    const prev: FizrukDualWriteState = { ...EMPTY, programs: a };
    expect(diffFizrukDualWriteOps(prev, EMPTY)).toEqual([]);
  });

  // --- Plan template (Stage 12.5) ---

  it("emits plan-template-set when blob changes from null to present", () => {
    const planTemplate: FizrukPlanTemplateSnapshot = {
      dataJson: '{"id":"t1"}',
    };
    const next: FizrukDualWriteState = { ...EMPTY, planTemplate };
    const ops = diffFizrukDualWriteOps(EMPTY, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "plan-template-set", planTemplate });
  });

  it("skips plan-template when JSON unchanged across reference change", () => {
    const a: FizrukPlanTemplateSnapshot = { dataJson: '{"id":"t1"}' };
    const b: FizrukPlanTemplateSnapshot = { dataJson: '{"id":"t1"}' };
    const prev: FizrukDualWriteState = { ...EMPTY, planTemplate: a };
    const next: FizrukDualWriteState = { ...EMPTY, planTemplate: b };
    expect(diffFizrukDualWriteOps(prev, next)).toEqual([]);
  });

  it("emits plan-template-set when JSON differs", () => {
    const a: FizrukPlanTemplateSnapshot = { dataJson: '{"id":"t1"}' };
    const b: FizrukPlanTemplateSnapshot = { dataJson: '{"id":"t2"}' };
    const prev: FizrukDualWriteState = { ...EMPTY, planTemplate: a };
    const next: FizrukDualWriteState = { ...EMPTY, planTemplate: b };
    const ops = diffFizrukDualWriteOps(prev, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "plan-template-set", planTemplate: b });
  });

  it("emits plan-template-set when slot is cleared to JSON literal 'null'", () => {
    const a: FizrukPlanTemplateSnapshot = { dataJson: '{"id":"t1"}' };
    const b: FizrukPlanTemplateSnapshot = { dataJson: "null" };
    const prev: FizrukDualWriteState = { ...EMPTY, planTemplate: a };
    const next: FizrukDualWriteState = { ...EMPTY, planTemplate: b };
    const ops = diffFizrukDualWriteOps(prev, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "plan-template-set", planTemplate: b });
  });

  it("does not emit a plan-template op when next is null (cold cache)", () => {
    const a: FizrukPlanTemplateSnapshot = { dataJson: '{"id":"t1"}' };
    const prev: FizrukDualWriteState = { ...EMPTY, planTemplate: a };
    expect(diffFizrukDualWriteOps(prev, EMPTY)).toEqual([]);
  });

  // --- Wellbeing (Stage 12.5) ---

  it("detects wellbeing add", () => {
    const e = makeWellbeing();
    const next: FizrukDualWriteState = { ...EMPTY, wellbeing: [e] };
    const ops = diffFizrukDualWriteOps(EMPTY, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "wellbeing-upsert", entry: e });
  });

  it("detects wellbeing delete (keyed by dateKey)", () => {
    const e = makeWellbeing();
    const prev: FizrukDualWriteState = { ...EMPTY, wellbeing: [e] };
    const ops = diffFizrukDualWriteOps(prev, EMPTY);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      kind: "wellbeing-delete",
      dateKey: "2026-05-01",
    });
  });

  it("detects wellbeing update (mood changed)", () => {
    const e1 = makeWellbeing({ mood: 3 });
    const e2 = makeWellbeing({ mood: 5, updatedAt: "2026-05-01T08:00:00Z" });
    const prev: FizrukDualWriteState = { ...EMPTY, wellbeing: [e1] };
    const next: FizrukDualWriteState = { ...EMPTY, wellbeing: [e2] };
    const ops = diffFizrukDualWriteOps(prev, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "wellbeing-upsert", entry: e2 });
  });

  it("skips wellbeing when fields equal across reference change", () => {
    const e1 = makeWellbeing();
    const e2 = makeWellbeing();
    const prev: FizrukDualWriteState = { ...EMPTY, wellbeing: [e1] };
    const next: FizrukDualWriteState = { ...EMPTY, wellbeing: [e2] };
    expect(diffFizrukDualWriteOps(prev, next)).toEqual([]);
  });

  it("emits an upsert + a delete when one entry is replaced and another removed", () => {
    const e1 = makeWellbeing({ dateKey: "2026-05-01" });
    const e2 = makeWellbeing({ dateKey: "2026-05-02", mood: 5 });
    const prev: FizrukDualWriteState = { ...EMPTY, wellbeing: [e1, e2] };
    const replaced = makeWellbeing({
      dateKey: "2026-05-01",
      mood: 1,
      updatedAt: "2026-05-01T09:00:00Z",
    });
    const next: FizrukDualWriteState = { ...EMPTY, wellbeing: [replaced] };
    const ops = diffFizrukDualWriteOps(prev, next);
    expect(ops).toHaveLength(2);
    const kinds = ops.map((o) => o.kind).sort();
    expect(kinds).toEqual(["wellbeing-delete", "wellbeing-upsert"]);
  });

  // --- Mixed (all nine entity classes) ---

  it("handles changes across all nine entity classes in one diff", () => {
    const w = makeWorkout();
    const ex = makeExercise();
    const m = makeMeasurement();
    const d = makeDailyLog();
    const monthly: FizrukMonthlyPlanSnapshot = { dataJson: '{"x":1}' };
    const t = makeTemplate();
    const programs: FizrukProgramsSnapshot = { activeProgramId: "prog-1" };
    const planTemplate: FizrukPlanTemplateSnapshot = {
      dataJson: '{"id":"t1"}',
    };
    const wb = makeWellbeing();

    const ops = diffFizrukDualWriteOps(EMPTY, {
      workouts: [w],
      customExercises: [ex],
      measurements: [m],
      dailyLog: [d],
      monthlyPlan: monthly,
      workoutTemplates: [t],
      programs,
      planTemplate,
      wellbeing: [wb],
    });
    const kinds = ops.map((o) => o.kind).sort();
    expect(kinds).toEqual(
      [
        "custom-exercise-upsert",
        "daily-log-upsert",
        "measurement-upsert",
        "monthly-plan-set",
        "plan-template-set",
        "programs-set",
        "wellbeing-upsert",
        "workout-template-upsert",
        "workout-upsert",
      ].sort(),
    );
  });
});

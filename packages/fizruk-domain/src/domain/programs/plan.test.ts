import { describe, expect, it } from "vitest";

import { findExerciseById } from "../../data/index.js";
import { TARGET_REP_RANGES } from "../../lib/workoutStats.js";
import { PROGRAM_CATALOGUE } from "./catalogue.js";
import {
  PROGRAM_DEFAULT_SETS,
  formatProgramExercisePlan,
  programExercisePlan,
  PROGRAM_TIMED_EXERCISES,
  PROGRAM_TIMED_SEC_RANGES,
  programPlanForWorkoutItem,
  programPlanTargetReps,
} from "./plan.js";
import type { ProgramSessionDef } from "./types.js";

function session(key: string): ProgramSessionDef {
  for (const p of PROGRAM_CATALOGUE) {
    const s = p.sessions[key];
    if (s) return s;
  }
  throw new Error(`no session ${key}`);
}

describe("programExercisePlan", () => {
  it("за замовчуванням дає 3 підходи і діапазон вправи з каталогу", () => {
    const push = session("push");
    expect(
      programExercisePlan(push, findExerciseById("bench_press_barbell")),
    ).toEqual({
      kind: "reps",
      sets: PROGRAM_DEFAULT_SETS,
      repsMin: TARGET_REP_RANGES.compound.min,
      repsMax: TARGET_REP_RANGES.compound.max,
    });
    expect(
      programExercisePlan(push, findExerciseById("lateral_raise")),
    ).toEqual({ kind: "reps", sets: 3, repsMin: 8, repsMax: 12 });
    expect(
      programExercisePlan(push, findExerciseById("tricep_pushdown")),
    ).toEqual({ kind: "reps", sets: 3, repsMin: 10, repsMax: 15 });
  });

  it("«Силовий 5×5» і «Лінійна прогресія» беруть план з власного опису", () => {
    const squat = findExerciseById("squat_barbell");
    expect(programExercisePlan(session("fivexfive_a"), squat)).toEqual({
      kind: "reps",
      sets: 5,
      repsMin: 5,
      repsMax: 5,
    });
    expect(programExercisePlan(session("ss_b"), squat)).toEqual({
      kind: "reps",
      sets: 3,
      repsMin: 5,
      repsMax: 5,
    });
  });

  it("власний план мають рівно чотири сесії з 23", () => {
    const all = PROGRAM_CATALOGUE.flatMap((p) => Object.entries(p.sessions));
    expect(all).toHaveLength(23);
    const withPlan = all
      .filter(([, s]) => s.plan != null)
      .map(([k]) => k)
      .sort();
    expect(withPlan).toEqual(["fivexfive_a", "fivexfive_b", "ss_a", "ss_b"]);
  });

  it("невідома вправа без каталогу падає на діапазон допоміжних", () => {
    expect(programExercisePlan(session("push"), null)).toEqual({
      kind: "reps",
      sets: 3,
      repsMin: TARGET_REP_RANGES.accessory.min,
      repsMax: TARGET_REP_RANGES.accessory.max,
    });
  });
});

describe("formatProgramExercisePlan", () => {
  it("пише діапазон через тире, а фіксоване число одним", () => {
    expect(
      formatProgramExercisePlan({
        kind: "reps",
        sets: 3,
        repsMin: 5,
        repsMax: 8,
      }),
    ).toBe("3×5–8");
    expect(
      formatProgramExercisePlan({
        kind: "reps",
        sets: 5,
        repsMin: 5,
        repsMax: 5,
      }),
    ).toBe("5×5");
  });
});

describe("programPlanTargetReps", () => {
  it("власний план сесії з привʼязки тренування дає фіксовані повтори", () => {
    expect(
      programPlanTargetReps({ programId: "strength_5x5", slot: 1 }),
    ).toEqual({ min: 5, max: 5 });
    expect(
      programPlanTargetReps({ programId: "starting_strength", slot: 0 }),
    ).toEqual({ min: 5, max: 5 });
  });

  it("сесія без власного плану, невідома програма чи слот — null (діапазон каталогу)", () => {
    expect(programPlanTargetReps({ programId: "ppl", slot: 0 })).toBeNull();
    expect(programPlanTargetReps({ programId: "nope", slot: 0 })).toBeNull();
    expect(
      programPlanTargetReps({ programId: "strength_5x5", slot: 9 }),
    ).toBeNull();
    expect(programPlanTargetReps(null)).toBeNull();
  });
});

describe("вправи на час у програмах (доручення founder-а 2026-11-18)", () => {
  it("утримання показує підходи × секунди, а не повтори", () => {
    const plan = programExercisePlan(
      session("home_push"),
      findExerciseById("plank"),
    );
    expect(plan).toEqual({
      kind: "time",
      sets: 3,
      secMin: PROGRAM_TIMED_SEC_RANGES.hold.min,
      secMax: PROGRAM_TIMED_SEC_RANGES.hold.max,
    });
    expect(formatProgramExercisePlan(plan)).toBe("3×20–40 с");
    expect(
      formatProgramExercisePlan(
        programExercisePlan(session("min_b"), findExerciseById("farmers_walk")),
      ),
    ).toBe("3×30–60 с");
  });

  it("кожна вправа на час справді стоїть у каталозі програм і в базі вправ", () => {
    const used = new Set(
      PROGRAM_CATALOGUE.flatMap((p) =>
        Object.values(p.sessions).flatMap((s) => s.exerciseIds),
      ),
    );
    for (const id of Object.keys(PROGRAM_TIMED_EXERCISES)) {
      expect(used.has(id)).toBe(true);
      expect(findExerciseById(id)).not.toBeNull();
    }
  });

  it("план вправи з привʼязки тренування", () => {
    expect(
      programPlanForWorkoutItem(
        { programId: "home_bodyweight", slot: 0 },
        findExerciseById("plank"),
      )?.kind,
    ).toBe("time");
    expect(
      programPlanForWorkoutItem(null, findExerciseById("plank")),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { findExerciseById } from "../../data/index.js";
import { TARGET_REP_RANGES } from "../../lib/workoutStats.js";
import { PROGRAM_CATALOGUE } from "./catalogue.js";
import {
  PROGRAM_DEFAULT_SETS,
  formatProgramExercisePlan,
  programExercisePlan,
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
      sets: PROGRAM_DEFAULT_SETS,
      repsMin: TARGET_REP_RANGES.compound.min,
      repsMax: TARGET_REP_RANGES.compound.max,
    });
    expect(
      programExercisePlan(push, findExerciseById("lateral_raise")),
    ).toEqual({ sets: 3, repsMin: 8, repsMax: 12 });
    expect(
      programExercisePlan(push, findExerciseById("tricep_pushdown")),
    ).toEqual({ sets: 3, repsMin: 10, repsMax: 15 });
  });

  it("«Силовий 5×5» і «Лінійна прогресія» беруть план з власного опису", () => {
    const squat = findExerciseById("squat_barbell");
    expect(programExercisePlan(session("fivexfive_a"), squat)).toEqual({
      sets: 5,
      repsMin: 5,
      repsMax: 5,
    });
    expect(programExercisePlan(session("ss_b"), squat)).toEqual({
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
      sets: 3,
      repsMin: TARGET_REP_RANGES.accessory.min,
      repsMax: TARGET_REP_RANGES.accessory.max,
    });
  });
});

describe("formatProgramExercisePlan", () => {
  it("пише діапазон через тире, а фіксоване число одним", () => {
    expect(formatProgramExercisePlan({ sets: 3, repsMin: 5, repsMax: 8 })).toBe(
      "3×5–8",
    );
    expect(formatProgramExercisePlan({ sets: 5, repsMin: 5, repsMax: 5 })).toBe(
      "5×5",
    );
  });
});

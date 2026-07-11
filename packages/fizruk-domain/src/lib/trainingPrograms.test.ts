/**
 * Integrity invariant: every schedule sessionKey in BUILTIN_PROGRAMS
 * must exist in the corresponding program's sessions map.
 */
import { describe, it, expect, vi } from "vitest";
import { BUILTIN_PROGRAMS } from "../index.js";
import type { TrainingProgramDef } from "../domain/programs/index.js";
import { getTodaySession } from "./trainingPrograms.js";

describe("BUILTIN_PROGRAMS integrity", () => {
  it("exports at least 4 programs", () => {
    expect(BUILTIN_PROGRAMS.length).toBeGreaterThanOrEqual(4);
  });

  it("every schedule sessionKey exists in the program sessions map", () => {
    for (const program of BUILTIN_PROGRAMS) {
      for (const slot of program.schedule) {
        expect(
          program.sessions[slot.sessionKey],
          `program "${program.id}" schedule references sessionKey "${slot.sessionKey}" which is missing from sessions`,
        ).toBeDefined();
      }
    }
  });

  it("each program has at least one session definition", () => {
    for (const program of BUILTIN_PROGRAMS) {
      expect(
        Object.keys(program.sessions).length,
        `program "${program.id}" has no sessions`,
      ).toBeGreaterThan(0);
    }
  });

  it("each session has at least one exerciseId", () => {
    for (const program of BUILTIN_PROGRAMS) {
      for (const [key, session] of Object.entries(program.sessions)) {
        expect(
          session.exerciseIds.length,
          `program "${program.id}" session "${key}" has no exerciseIds`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("program.days equals the number of schedule entries", () => {
    for (const program of BUILTIN_PROGRAMS) {
      expect(
        program.days,
        `program "${program.id}" days mismatch schedule length`,
      ).toBe(program.schedule.length);
    }
  });

  it("all schedule day values are between 1 and 7 inclusive", () => {
    for (const program of BUILTIN_PROGRAMS) {
      for (const slot of program.schedule) {
        expect(slot.day).toBeGreaterThanOrEqual(1);
        expect(slot.day).toBeLessThanOrEqual(7);
      }
    }
  });

  it("ppl program has push, pull, legs sessions", () => {
    const ppl = BUILTIN_PROGRAMS.find((p) => p.id === "ppl");
    expect(ppl).toBeDefined();
    expect(ppl!.sessions["push"]).toBeDefined();
    expect(ppl!.sessions["pull"]).toBeDefined();
    expect(ppl!.sessions["legs"]).toBeDefined();
  });

  it("upper_lower program has upper_a, lower_a, upper_b, lower_b sessions", () => {
    const ul = BUILTIN_PROGRAMS.find((p) => p.id === "upper_lower");
    expect(ul).toBeDefined();
    expect(ul!.sessions["upper_a"]).toBeDefined();
    expect(ul!.sessions["lower_a"]).toBeDefined();
    expect(ul!.sessions["upper_b"]).toBeDefined();
    expect(ul!.sessions["lower_b"]).toBeDefined();
  });

  it("full_body program has full_a and full_b sessions", () => {
    const fb = BUILTIN_PROGRAMS.find((p) => p.id === "full_body");
    expect(fb).toBeDefined();
    expect(fb!.sessions["full_a"]).toBeDefined();
    expect(fb!.sessions["full_b"]).toBeDefined();
  });

  it("starting_strength program has ss_a and ss_b sessions", () => {
    const ss = BUILTIN_PROGRAMS.find((p) => p.id === "starting_strength");
    expect(ss).toBeDefined();
    expect(ss!.sessions["ss_a"]).toBeDefined();
    expect(ss!.sessions["ss_b"]).toBeDefined();
  });

  it("legacy getTodaySession returns today's schedule slot or null", () => {
    const program: TrainingProgramDef = {
      id: "test",
      name: "Test",
      description: "Test",
      days: 1,
      durationWeeks: 4,
      schedule: [{ day: 1, sessionKey: "a", name: "A" }],
      sessions: {
        a: {
          name: "A",
          exerciseIds: ["bench"],
          progressionKg: 2.5,
          defaultRestSec: 90,
        },
      },
    };

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 12, 0, 0, 0));
    expect(getTodaySession(program)).toEqual(program.schedule[0]);
    expect(getTodaySession(null)).toBeNull();
    vi.setSystemTime(new Date(2026, 0, 6, 12, 0, 0, 0));
    expect(getTodaySession(program)).toBeNull();
    vi.useRealTimers();
  });
});

/**
 * Vitest coverage for `@sergeant/fizruk-domain/domain/programs`.
 *
 * Exercised helpers:
 *  - catalogue integrity (shape + session-key cross-refs)
 *  - `findProgramById` / `resolveActiveProgram`
 *  - `weekdayIndex`, `getProgramScheduleForDay`,
 *    `getProgramSessionForDay`, `resolveTodaySession`
 *  - `normalizeActiveProgramState`
 *  - `formatDurationWeeks`, `formatFrequency`, `formatProgramCadence`,
 *    `ukPluralCategory`
 */

import { describe, expect, it } from "vitest";

import {
  PROGRAM_CATALOGUE,
  defaultActiveProgramState,
  findProgramById,
  formatDurationWeeks,
  formatFrequency,
  formatProgramCadence,
  getProgramScheduleForDay,
  getProgramSessionForDay,
  normalizeActiveProgramState,
  resolveActiveProgram,
  resolveTodaySession,
  ukPluralCategory,
  weekdayIndex,
  type TrainingProgramDef,
} from "./index.js";

describe("PROGRAM_CATALOGUE", () => {
  it("exposes at least the four built-in programs", () => {
    expect(PROGRAM_CATALOGUE.length).toBeGreaterThanOrEqual(4);
    const ids = PROGRAM_CATALOGUE.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "ppl",
        "upper_lower",
        "full_body",
        "starting_strength",
      ]),
    );
  });

  it("every schedule entry references a session key that exists on the program", () => {
    for (const program of PROGRAM_CATALOGUE) {
      for (const slot of program.schedule) {
        expect(program.sessions[slot.sessionKey]).toBeDefined();
        expect(slot.day).toBeGreaterThanOrEqual(1);
        expect(slot.day).toBeLessThanOrEqual(7);
      }
    }
  });

  it("program.days equals schedule length", () => {
    for (const program of PROGRAM_CATALOGUE) {
      expect(program.days).toBe(program.schedule.length);
    }
  });
});

describe("findProgramById / resolveActiveProgram", () => {
  it("returns the catalogue entry by id", () => {
    const prog = findProgramById("ppl");
    expect(prog?.id).toBe("ppl");
    expect(prog?.days).toBe(6);
  });

  it("returns null for unknown id, empty string, or null", () => {
    expect(findProgramById("does-not-exist")).toBeNull();
    expect(findProgramById("")).toBeNull();
    expect(findProgramById(null)).toBeNull();
    expect(findProgramById(undefined)).toBeNull();
  });

  it("resolveActiveProgram is the same as findProgramById against a custom catalogue", () => {
    const fake: TrainingProgramDef = {
      id: "fake",
      name: "Fake",
      description: "",
      days: 1,
      durationWeeks: 1,
      schedule: [{ day: 1, sessionKey: "x", name: "X" }],
      sessions: {
        x: {
          name: "X",
          exerciseIds: ["a"],
          progressionKg: 0,
          defaultRestSec: 60,
        },
      },
    };
    expect(resolveActiveProgram("fake", [fake])?.id).toBe("fake");
    expect(resolveActiveProgram("ppl", [fake])).toBeNull();
  });
});

describe("weekdayIndex", () => {
  it("maps JS Date getDay (Sun=0) to Monday-first 0-indexed", () => {
    // 2026-04-20 is a Monday.
    expect(weekdayIndex(new Date("2026-04-20T12:00:00Z"))).toBe(0);
    // 2026-04-26 is a Sunday.
    expect(weekdayIndex(new Date("2026-04-26T12:00:00Z"))).toBe(6);
    // 2026-04-22 is a Wednesday.
    expect(weekdayIndex(new Date("2026-04-22T12:00:00Z"))).toBe(2);
  });
});

describe("getProgramScheduleForDay", () => {
  const ppl = PROGRAM_CATALOGUE.find((p) => p.id === "ppl")!;

  it("returns the schedule slot when the program trains that day", () => {
    const mon = getProgramScheduleForDay(ppl, 0);
    expect(mon?.sessionKey).toBe("push");
    const tue = getProgramScheduleForDay(ppl, 1);
    expect(tue?.sessionKey).toBe("pull");
  });

  it("returns null for rest days", () => {
    // PPL schedules Mon–Sat (days 1-6), Sunday (index 6) is a rest day.
    expect(getProgramScheduleForDay(ppl, 6)).toBeNull();
  });

  it("returns null for null program or out-of-range day index", () => {
    expect(getProgramScheduleForDay(null, 0)).toBeNull();
    expect(getProgramScheduleForDay(ppl, -1)).toBeNull();
    expect(getProgramScheduleForDay(ppl, 7)).toBeNull();
    expect(getProgramScheduleForDay(ppl, Number.NaN)).toBeNull();
  });
});

describe("getProgramSessionForDay", () => {
  const ppl = PROGRAM_CATALOGUE.find((p) => p.id === "ppl")!;

  it("resolves the session definition for a training day", () => {
    const push = getProgramSessionForDay(ppl, 0);
    expect(push?.name).toBe("Push Day");
    expect(push?.exerciseIds.length).toBeGreaterThan(0);
  });

  it("returns null for a rest day", () => {
    expect(getProgramSessionForDay(ppl, 6)).toBeNull();
  });

  it("returns null for nullish programs and missing session keys", () => {
    const broken: TrainingProgramDef = {
      id: "broken",
      name: "Broken",
      description: "",
      days: 1,
      durationWeeks: 1,
      schedule: [{ day: 1, sessionKey: "ghost", name: "Ghost" }],
      sessions: {},
    };

    expect(getProgramSessionForDay(null, 0)).toBeNull();
    expect(getProgramSessionForDay(undefined, 0)).toBeNull();
    expect(getProgramSessionForDay(broken, 0)).toBeNull();
  });
});

describe("resolveTodaySession", () => {
  const ppl = PROGRAM_CATALOGUE.find((p) => p.id === "ppl")!;

  it("returns the {programId, schedule, session} triple for a training day", () => {
    // 2026-04-21 is a Tuesday → ppl schedules pull.
    const result = resolveTodaySession(ppl, new Date("2026-04-21T12:00:00Z"));
    expect(result?.programId).toBe("ppl");
    expect(result?.schedule.sessionKey).toBe("pull");
    expect(result?.session.name).toBe("Pull Day");
  });

  it("returns null on a rest day", () => {
    // 2026-04-26 is a Sunday (index 6). PPL's schedule covers days 1-6.
    expect(
      resolveTodaySession(ppl, new Date("2026-04-26T12:00:00Z")),
    ).toBeNull();
  });

  it("returns null when the program is null", () => {
    expect(resolveTodaySession(null)).toBeNull();
  });

  it("returns null when a session key is missing from sessions map", () => {
    const broken: TrainingProgramDef = {
      id: "broken",
      name: "Broken",
      description: "",
      days: 1,
      durationWeeks: 1,
      schedule: [{ day: 1, sessionKey: "ghost", name: "Ghost" }],
      sessions: {},
    };
    expect(
      resolveTodaySession(broken, new Date("2026-04-20T12:00:00Z")),
    ).toBeNull();
  });
});

describe("normalizeActiveProgramState", () => {
  it("returns the default state for null / undefined input", () => {
    expect(normalizeActiveProgramState(null)).toEqual(
      defaultActiveProgramState(),
    );
    expect(normalizeActiveProgramState(undefined)).toEqual({
      activeProgramId: null,
    });
  });

  it("accepts a bare string id (legacy web format)", () => {
    expect(normalizeActiveProgramState("ppl")).toEqual({
      activeProgramId: "ppl",
    });
  });

  it("treats an empty or whitespace string as 'no active program'", () => {
    expect(normalizeActiveProgramState("")).toEqual({ activeProgramId: null });
    expect(normalizeActiveProgramState("   ")).toEqual({
      activeProgramId: null,
    });
  });

  it("accepts the object form `{ activeProgramId }`", () => {
    expect(
      normalizeActiveProgramState({ activeProgramId: "full_body" }),
    ).toEqual({
      activeProgramId: "full_body",
    });
  });

  it("falls back to default on malformed input", () => {
    expect(normalizeActiveProgramState({ activeProgramId: 42 })).toEqual({
      activeProgramId: null,
    });
    expect(normalizeActiveProgramState([])).toEqual({
      activeProgramId: null,
    });
    expect(normalizeActiveProgramState(true)).toEqual({
      activeProgramId: null,
    });
  });
});

describe("formatDurationWeeks", () => {
  it("uses the 'one' plural form for 1, 21, 31, …", () => {
    expect(formatDurationWeeks(1)).toBe("1 тиждень");
    expect(formatDurationWeeks(21)).toBe("21 тиждень");
    expect(formatDurationWeeks(31)).toBe("31 тиждень");
  });

  it("uses the 'few' plural form for 2–4, 22–24, …", () => {
    expect(formatDurationWeeks(2)).toBe("2 тижні");
    expect(formatDurationWeeks(3)).toBe("3 тижні");
    expect(formatDurationWeeks(24)).toBe("24 тижні");
  });

  it("uses the 'many' plural form for 5–20, 11–14, 25+, …", () => {
    expect(formatDurationWeeks(5)).toBe("5 тижнів");
    expect(formatDurationWeeks(8)).toBe("8 тижнів");
    expect(formatDurationWeeks(11)).toBe("11 тижнів");
    expect(formatDurationWeeks(25)).toBe("25 тижнів");
  });

  it("clamps non-finite input to 0", () => {
    expect(formatDurationWeeks(Number.NaN)).toBe("0 тижнів");
    expect(formatDurationWeeks(-3)).toBe("0 тижнів");
    expect(formatDurationWeeks(Number.POSITIVE_INFINITY)).toBe("0 тижнів");
  });
});

describe("formatFrequency / formatProgramCadence", () => {
  const ppl = PROGRAM_CATALOGUE.find((p) => p.id === "ppl")!;
  const startingStrength = PROGRAM_CATALOGUE.find(
    (p) => p.id === "starting_strength",
  )!;

  it("formats days-per-week", () => {
    expect(formatFrequency(ppl)).toBe("6 дн/тиждень");
    expect(formatFrequency(startingStrength)).toBe("3 дн/тиждень");
  });

  it("clamps invalid and negative day counts to zero", () => {
    const base = PROGRAM_CATALOGUE[0]!;
    expect(formatFrequency({ ...base, days: Number.NaN })).toBe("0 дн/тиждень");
    expect(formatFrequency({ ...base, days: -2 })).toBe("0 дн/тиждень");
  });

  it("combines frequency + duration for the card line", () => {
    expect(formatProgramCadence(ppl)).toBe("6 дн/тиждень · 8 тижнів");
    expect(formatProgramCadence(startingStrength)).toBe(
      "3 дн/тиждень · 12 тижнів",
    );
  });
});

describe("ukPluralCategory", () => {
  it("agrees with the Ukrainian plural rules over a range of small integers", () => {
    expect(ukPluralCategory(0)).toBe("many");
    expect(ukPluralCategory(1)).toBe("one");
    expect(ukPluralCategory(4)).toBe("few");
    expect(ukPluralCategory(11)).toBe("many");
    expect(ukPluralCategory(12)).toBe("many");
    expect(ukPluralCategory(14)).toBe("many");
    expect(ukPluralCategory(21)).toBe("one");
    expect(ukPluralCategory(22)).toBe("few");
    expect(ukPluralCategory(25)).toBe("many");
  });
});

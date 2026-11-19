import { describe, expect, it } from "vitest";

import { PROGRAM_CATALOGUE } from "./catalogue.js";
import {
  lastFullProgramWorkout,
  normalizeWorkoutProgramRef,
  resolveProgramCursor,
  resolveProgramDay,
} from "./cursor.js";

const ss = PROGRAM_CATALOGUE.find((p) => p.id === "starting_strength")!;

/** Повноцінне: три зараховані силові підходи. */
function fullWorkout(slot: number, startedAt: string, programId = ss.id) {
  return {
    id: `w-${slot}-${startedAt}`,
    startedAt,
    endedAt: new Date(Date.parse(startedAt) + 10 * 60_000).toISOString(),
    items: [
      {
        type: "strength",
        sets: [
          { weightKg: 60, reps: 5 },
          { weightKg: 60, reps: 5 },
          { weightKg: 60, reps: 5 },
        ],
      },
    ],
    programRef: { programId, slot },
  };
}

/** Обірване: 5 хвилин і запланові рядки без повторень. */
function abandoned(slot: number, startedAt: string) {
  return {
    id: `a-${slot}`,
    startedAt,
    endedAt: new Date(Date.parse(startedAt) + 5 * 60_000).toISOString(),
    items: [{ type: "strength", sets: [{ weightKg: 60, reps: 0 }] }],
    programRef: { programId: ss.id, slot },
  };
}

describe("resolveProgramCursor", () => {
  it("без історії програми бере сьогоднішній слот розкладу", () => {
    // 2026-04-22 — середа, слот 1 (ss_b).
    const c = resolveProgramCursor(ss, [], new Date("2026-04-22T12:00:00Z"));
    expect(c).toMatchObject({ slot: 1, doneToday: false });
    expect(c?.schedule.sessionKey).toBe("ss_b");
  });

  it("без історії у день відпочинку бере наступний слот розкладу", () => {
    // 2026-04-21 — вівторок → середа, слот 1.
    const c = resolveProgramCursor(ss, [], new Date("2026-04-21T12:00:00Z"));
    expect(c?.slot).toBe(1);
  });

  it("слот після останнього повноцінного тренування програми, хоч би який день", () => {
    // Пропущена середа: у четвер програма пропонує слот 1, а не пʼятничний 2.
    const c = resolveProgramCursor(
      ss,
      [fullWorkout(0, "2026-04-20T10:00:00Z")],
      new Date("2026-04-23T12:00:00Z"),
    );
    expect(c).toMatchObject({ slot: 1, doneToday: false });
    expect(c?.session.name).toBe("Workout B");
  });

  it("після останнього слоту повертається на початок розкладу", () => {
    const c = resolveProgramCursor(
      ss,
      [fullWorkout(2, "2026-04-24T10:00:00Z")],
      new Date("2026-04-27T12:00:00Z"),
    );
    expect(c?.slot).toBe(0);
  });

  it("обірване тренування програму не рухає", () => {
    const c = resolveProgramCursor(
      ss,
      [
        abandoned(1, "2026-04-22T10:00:00Z"),
        fullWorkout(0, "2026-04-20T10:00:00Z"),
      ],
      new Date("2026-04-23T12:00:00Z"),
    );
    expect(c?.slot).toBe(1);
  });

  it("тренування чужої програми й поза програмою не рахуються", () => {
    const c = resolveProgramCursor(
      ss,
      [
        fullWorkout(2, "2026-04-22T10:00:00Z", "ppl"),
        { ...fullWorkout(0, "2026-04-22T11:00:00Z"), programRef: undefined },
        fullWorkout(0, "2026-04-20T10:00:00Z"),
      ],
      new Date("2026-04-23T12:00:00Z"),
    );
    expect(c?.slot).toBe(1);
  });

  it("слот поза розкладом (програму змінили) ігнорується", () => {
    const c = resolveProgramCursor(
      ss,
      [fullWorkout(7, "2026-04-22T10:00:00Z")],
      new Date("2026-04-22T12:00:00Z"),
    );
    expect(c?.slot).toBe(1);
  });

  it("повноцінне тренування програми сьогодні позначає день закритим", () => {
    const c = resolveProgramCursor(
      ss,
      [fullWorkout(1, "2026-04-22T10:00:00Z")],
      new Date("2026-04-22T18:00:00Z"),
    );
    expect(c).toMatchObject({ slot: 2, doneToday: true });
  });

  it("null без програми", () => {
    expect(resolveProgramCursor(null, [])).toBeNull();
  });
});

describe("lastFullProgramWorkout", () => {
  it("бере найпізніше за початком", () => {
    const last = lastFullProgramWorkout(ss, [
      fullWorkout(0, "2026-04-20T10:00:00Z"),
      fullWorkout(1, "2026-04-22T10:00:00Z"),
    ]);
    expect(last?.programRef?.slot).toBe(1);
  });
});

describe("normalizeWorkoutProgramRef", () => {
  it("обидва задані й валідні → ref, обидва порожні → null", () => {
    expect(normalizeWorkoutProgramRef("ppl", 3)).toEqual({
      programId: "ppl",
      slot: 3,
    });
    expect(normalizeWorkoutProgramRef(null, null)).toBeNull();
    expect(normalizeWorkoutProgramRef(undefined, undefined)).toBeNull();
  });

  it("половина пари, порожній id, дробовий чи відʼємний слот — invalid", () => {
    expect(normalizeWorkoutProgramRef("ppl", null)).toBe("invalid");
    expect(normalizeWorkoutProgramRef(null, 0)).toBe("invalid");
    expect(normalizeWorkoutProgramRef("", 0)).toBe("invalid");
    expect(normalizeWorkoutProgramRef("ppl", -1)).toBe("invalid");
    expect(normalizeWorkoutProgramRef("ppl", 1.5)).toBe("invalid");
    expect(normalizeWorkoutProgramRef("ppl", "2")).toBe("invalid");
  });
});

describe("resolveProgramDay", () => {
  it("тренувальний день: сьогодні курсор, а не сесія дня тижня", () => {
    // Пт 2026-04-24, остання повноцінна — слот 0 у понеділок → сьогодні слот 1.
    const d = resolveProgramDay(
      ss,
      [fullWorkout(0, "2026-04-20T10:00:00Z")],
      new Date("2026-04-24T12:00:00Z"),
    );
    expect(d.rest).toBeNull();
    expect(d.today).toMatchObject({ slot: 1 });
    expect(d.today?.schedule.name).toBe("Workout B");
  });

  it("день відпочинку: наступна сесія курсора і днів до тренувального дня", () => {
    // Чт 2026-04-23 → пʼятниця за 1 день.
    const d = resolveProgramDay(
      ss,
      [fullWorkout(0, "2026-04-20T10:00:00Z")],
      new Date("2026-04-23T12:00:00Z"),
    );
    expect(d.today).toBeNull();
    expect(d.rest).toMatchObject({ slot: 1, daysFromNow: 1, doneToday: false });
  });

  it("закритий сьогодні тренувальний день не пропонує другу сесію", () => {
    const d = resolveProgramDay(
      ss,
      [fullWorkout(1, "2026-04-22T10:00:00Z")],
      new Date("2026-04-22T18:00:00Z"),
    );
    expect(d.today).toBeNull();
    expect(d.rest).toMatchObject({ slot: 2, daysFromNow: 2, doneToday: true });
  });

  it("без програми нічого", () => {
    expect(resolveProgramDay(null, [])).toEqual({ today: null, rest: null });
  });
});

import { describe, expect, it } from "vitest";

import {
  FULL_WORKOUT_MIN_DURATION_SEC,
  FULL_WORKOUT_MIN_STRENGTH_SETS,
  classifyWorkoutWeight,
  isFullWorkout,
  isLightWorkout,
} from "./activityWeight.js";

const START = "2026-09-15T18:00:00.000Z";

function endedAfter(sec: number): string {
  return new Date(Date.parse(START) + sec * 1000).toISOString();
}

function strength(sets: number, endSec = 60) {
  return {
    startedAt: START,
    endedAt: endedAfter(endSec),
    items: [
      {
        type: "strength",
        sets: Array.from({ length: sets }, () => ({ weightKg: 0, reps: 20 })),
      },
    ],
  };
}

describe("classifyWorkoutWeight", () => {
  it("програмне тренування без жодного виконаного підходу не повноцінне", () => {
    // Старт програми сіє по рядку {вага, 0} на вправу; завершили, нічого не
    // зробивши, за 5 хвилин по годиннику.
    const untouched = {
      startedAt: START,
      endedAt: endedAfter(5 * 60),
      items: [1, 2, 3, 4].map(() => ({
        type: "strength",
        sets: [{ weightKg: 60, reps: 0 }],
      })),
    };
    expect(classifyWorkoutWeight(untouched)).toBe("light");
    expect(isFullWorkout(untouched)).toBe(false);
  });

  it("незавершене тренування ваги не має", () => {
    expect(
      classifyWorkoutWeight({ startedAt: START, endedAt: null, items: [] }),
    ).toBeNull();
    expect(classifyWorkoutWeight(null)).toBeNull();
  });

  it("заняття за часом від 20 хвилин — повноцінне, коротше — легке", () => {
    const long = {
      startedAt: START,
      endedAt: endedAfter(FULL_WORKOUT_MIN_DURATION_SEC),
      items: [{ type: "time", durationSec: FULL_WORKOUT_MIN_DURATION_SEC }],
    };
    const short = {
      startedAt: START,
      endedAt: endedAfter(10 * 60),
      items: [{ type: "time", durationSec: 10 * 60 }],
    };
    expect(classifyWorkoutWeight(long)).toBe("full");
    expect(classifyWorkoutWeight(short)).toBe("light");
  });

  it("силове від трьох підходів — повноцінне навіть за коротким годинником", () => {
    // Три підходи за хвилину по годиннику — так виглядає детальний запис,
    // у якому час старту й кінця людина не вела. Обʼєм тут вирішує.
    expect(
      classifyWorkoutWeight(strength(FULL_WORKOUT_MIN_STRENGTH_SETS)),
    ).toBe("full");
  });

  it("«+20 відтискань» одним підходом за пів хвилини — легке", () => {
    // Рівно те, що пише швидкий запис із домашньої тренувань: один підхід,
    // нульова вага, півхвилинна тривалість. Рішення власника 2026-09-15 —
    // лишається на дні, але серію не рухає.
    expect(classifyWorkoutWeight(strength(1, 30))).toBe("light");
    expect(isLightWorkout(strength(1, 30))).toBe(true);
    expect(isFullWorkout(strength(1, 30))).toBe(false);
  });

  it("порожні підходи (0×0) не рахуються в обʼєм", () => {
    const w = {
      startedAt: START,
      endedAt: endedAfter(60),
      items: [
        {
          type: "strength",
          sets: [
            { weightKg: 0, reps: 0 },
            { weightKg: 0, reps: 0 },
            { weightKg: 0, reps: 0 },
          ],
        },
      ],
    };
    expect(classifyWorkoutWeight(w)).toBe("light");
  });

  it("порожня завершена сесія без часу й без вправ — легка, не помилка", () => {
    expect(
      classifyWorkoutWeight({ startedAt: START, endedAt: START, items: [] }),
    ).toBe("light");
  });
});

describe("поріг повноцінного — підходи будь-якого типу виміру (Р-3, Б-2)", () => {
  it("три утримання по 30 с за 5 хвилин — повноцінне", () => {
    const holds = {
      startedAt: START,
      endedAt: endedAfter(5 * 60),
      items: [
        {
          type: "time",
          measure: "time",
          sets: [30, 30, 30].map((s) => ({
            weightKg: 0,
            reps: 0,
            durationSec: s,
          })),
        },
      ],
    };
    expect(isFullWorkout(holds)).toBe(true);
  });

  it("три інтервали по 400 м — повноцінне", () => {
    const intervals = {
      startedAt: START,
      endedAt: endedAfter(6 * 60),
      items: [
        {
          type: "distance",
          measure: "distance_time",
          sets: [1, 2, 3].map(() => ({
            weightKg: 0,
            reps: 0,
            distanceM: 400,
            durationSec: 80,
          })),
        },
      ],
    };
    expect(isFullWorkout(intervals)).toBe(true);
  });

  it("запис «Заняття й час» без підходів лишається на порозі годинника", () => {
    const yoga = {
      startedAt: START,
      endedAt: endedAfter(10 * 60),
      items: [{ type: "time", durationSec: 600 }],
    };
    expect(isLightWorkout(yoga)).toBe(true);
  });
});

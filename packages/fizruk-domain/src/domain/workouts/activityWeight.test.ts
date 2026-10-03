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

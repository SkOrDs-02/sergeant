import { describe, expect, it } from "vitest";

import {
  collectExerciseHistory,
  computeExerciseBest,
} from "./exerciseDetail.js";
import {
  INJURY_RETURN_FACTOR,
  INJURY_RETURN_WINDOW_DAYS,
  ONE_RM_DECAY_FLOOR,
  ONE_RM_STALE_AFTER_DAYS,
  computeOneRmAging,
  computeOneRmAgingForSummary,
} from "./oneRmAging.js";
import type { Workout } from "./types.js";

const NOW = new Date("2026-08-02T12:00:00.000Z");

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

function strengthWorkout(
  id: string,
  startedAt: string,
  sets: ReadonlyArray<{ weightKg: number; reps: number }>,
): Workout {
  return {
    id,
    startedAt,
    endedAt: startedAt,
    items: [
      {
        id: `${id}_it`,
        exerciseId: "squat",
        type: "strength",
        sets: sets.map((s, i) => ({ id: `${id}_s${i}`, ...s })),
      },
    ],
  } as unknown as Workout;
}

describe("computeOneRmAging — старіння", () => {
  it("свіжа 1RM: орієнтир дорівнює піку, режиму повернення немає", () => {
    const aging = computeOneRmAging({
      peak1rm: 120,
      lastSessionAt: daysAgo(3),
      now: NOW,
    });
    expect(aging.isStale).toBe(false);
    expect(aging.returnMode).toBe(false);
    expect(aging.reference1rm).toBe(120);
    expect(aging.reductionPct).toBe(0);
  });

  it("рівно на порозі 1RM уже застаріла, але ще не занижена", () => {
    const aging = computeOneRmAging({
      peak1rm: 120,
      lastSessionAt: daysAgo(ONE_RM_STALE_AFTER_DAYS),
      now: NOW,
    });
    // Застереження вмикається раніше за зниження — це навмисно: спершу
    // кажемо «число старе», і лише потім починаємо його рухати.
    expect(aging.isStale).toBe(true);
    expect(aging.returnMode).toBe(true);
    expect(aging.returnReason).toBe("layoff");
    expect(aging.reference1rm).toBe(120);
  });

  it("орієнтир знижується за кожен тиждень понад поріг", () => {
    const aging = computeOneRmAging({
      peak1rm: 100,
      lastSessionAt: daysAgo(ONE_RM_STALE_AFTER_DAYS + 14),
      now: NOW,
    });
    // 2 тижні понад поріг × 2.5% = 5%.
    expect(aging.reductionPct).toBe(5);
    expect(aging.reference1rm).toBeCloseTo(95, 5);
    // Пік НЕ переписаний — рекорд лишається рекордом.
    expect(aging.peak1rm).toBe(100);
  });

  it("зниження має підлогу — після дуже довгої паузи число не падає в нуль", () => {
    const aging = computeOneRmAging({
      peak1rm: 100,
      lastSessionAt: daysAgo(5 * 365),
      now: NOW,
    });
    expect(aging.reference1rm).toBeCloseTo(100 * ONE_RM_DECAY_FLOOR, 5);
  });

  it("без історії підходів нічого не старіє", () => {
    const aging = computeOneRmAging({ peak1rm: 0, now: NOW });
    expect(aging.isStale).toBe(false);
    expect(aging.returnMode).toBe(false);
    expect(aging.reference1rm).toBe(0);
    expect(aging.daysSinceLastSession).toBeNull();
  });

  it("дата з майбутнього не омолоджує орієнтир", () => {
    const aging = computeOneRmAging({
      peak1rm: 100,
      lastSessionAt: daysAgo(-30),
      now: NOW,
    });
    expect(aging.daysSinceLastSession).toBe(0);
    expect(aging.isStale).toBe(false);
  });
});

describe("computeOneRmAging — протокол повернення після травми (E-5)", () => {
  it("свіже зняття позначки вмикає мʼякий режим навіть без паузи", () => {
    const aging = computeOneRmAging({
      peak1rm: 100,
      lastSessionAt: daysAgo(2),
      injuryClearedAt: daysAgo(1),
      now: NOW,
    });
    expect(aging.isStale).toBe(false);
    expect(aging.returnMode).toBe(true);
    expect(aging.returnReason).toBe("injury");
    expect(aging.reference1rm).toBeCloseTo(100 * INJURY_RETURN_FACTOR, 5);
  });

  it("після вікна повернення позначка більше не діє", () => {
    const aging = computeOneRmAging({
      peak1rm: 100,
      lastSessionAt: daysAgo(2),
      injuryClearedAt: daysAgo(INJURY_RETURN_WINDOW_DAYS + 1),
      now: NOW,
    });
    expect(aging.returnMode).toBe(false);
    expect(aging.reference1rm).toBe(100);
  });

  it("травма + довга пауза беруть суворіший коефіцієнт, а не добуток", () => {
    const aging = computeOneRmAging({
      peak1rm: 100,
      lastSessionAt: daysAgo(ONE_RM_STALE_AFTER_DAYS + 14), // −5%
      injuryClearedAt: daysAgo(1), // −10%
      now: NOW,
    });
    expect(aging.reference1rm).toBeCloseTo(90, 5);
    expect(aging.returnReason).toBe("injury");
  });
});

describe("computeExerciseBest — регрес і давність", () => {
  it("бачить регрес, а не лише рекорд", () => {
    const workouts = [
      strengthWorkout("w_old", daysAgo(60), [{ weightKg: 100, reps: 5 }]),
      strengthWorkout("w_new", daysAgo(2), [{ weightKg: 80, reps: 5 }]),
    ];
    const best = computeExerciseBest(collectExerciseHistory(workouts, "squat"));
    expect(best.isNewPR).toBe(false);
    expect(best.isRegression).toBe(true);
    expect(best.deltaVsPeakPct).toBe(-20);
    expect(best.lastStrengthAt).toBe(workouts[1]!.startedAt);
  });

  it("просідання в межах шуму регресом не називається", () => {
    const workouts = [
      strengthWorkout("w_old", daysAgo(60), [{ weightKg: 100, reps: 5 }]),
      strengthWorkout("w_new", daysAgo(2), [{ weightKg: 100, reps: 4 }]),
    ];
    const best = computeExerciseBest(collectExerciseHistory(workouts, "squat"));
    // Epley: 116.7 → 113.3, тобто −3% на тій самій робочій вазі.
    expect(best.isRegression).toBe(false);
  });

  it("давність рахується від СИЛОВОЇ сесії, а не від будь-якого запису", () => {
    const cardio = {
      id: "w_cardio",
      startedAt: daysAgo(1),
      endedAt: daysAgo(1),
      items: [
        {
          id: "w_cardio_it",
          exerciseId: "squat",
          type: "distance",
          distanceM: 5000,
          durationSec: 1500,
        },
      ],
    } as unknown as Workout;
    const workouts = [
      strengthWorkout("w_str", daysAgo(40), [{ weightKg: 100, reps: 5 }]),
      cardio,
    ];
    const best = computeExerciseBest(collectExerciseHistory(workouts, "squat"));
    expect(best.lastStrengthAt).toBe(workouts[0]!.startedAt);

    const aging = computeOneRmAgingForSummary(best, { now: NOW });
    expect(aging.isStale).toBe(true);
    expect(aging.daysSinceLastSession).toBe(40);
  });
});

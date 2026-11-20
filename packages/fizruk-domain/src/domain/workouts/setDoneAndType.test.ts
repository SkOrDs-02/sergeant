/**
 * Явний прапорець «виконано» і тип підходу (спека
 * `fizruk-set-done-flag-and-set-type.md`, рішення власника 2026-11-19
 * П-Фз3-1…3): прапорець лише віднімає рядок із підрахунку, розминка поза
 * результатом, але в навантаженні відновлення, дроп і «до відмови» —
 * позначка.
 */
import { describe, expect, it } from "vitest";

import {
  getExercisePR,
  itemTonnageKg,
  personalRecordsExerciseCount,
  progressionTopSet,
} from "../../lib/workoutStats.js";
import { calcFizrukPeriodAggregate } from "../../lib/periodAggregate.js";
import { loadPointsForItem } from "../../lib/recoveryCompute.js";
import { countExercisePRs } from "../progress/progressKpis.js";
import { computeTopPRs } from "../dashboard/topPRs.js";
import { listRecentCompletedWorkouts } from "../dashboard/recentWorkouts.js";
import {
  computeWorkoutDoneItemCount,
  computeWorkoutSetCount,
  computeWorkoutTonnageKg,
} from "./journal.js";
import { isFullWorkout } from "./activityWeight.js";
import {
  computeExerciseBest,
  computeExerciseWeeklyTrend,
} from "./exerciseDetail.js";
import { collectStrengthSessionPoints } from "./oneRmAging.js";
import type { ExerciseHistoryEntry } from "./exerciseDetail.js";
import {
  getExerciseMeasureRecord,
  sumCompletedSets,
} from "./measureRecords.js";
import { isSetCompleted, isWarmupSet, isWorkingSet } from "./setCompletion.js";

const STRENGTH = {
  id: "i1",
  exerciseId: "bench",
  nameUk: "Жим",
  type: "strength",
  measure: "weight_reps",
} as const;

function workout(sets: Record<string, unknown>[], extra = {}) {
  return {
    id: "w1",
    startedAt: "2026-11-10T10:00:00.000Z",
    endedAt: "2026-11-10T10:10:00.000Z",
    items: [{ ...STRENGTH, sets, ...extra }],
  };
}

describe("isSetCompleted — явний прапорець", () => {
  it("NULL / відсутнє поле — чинне правило (старі рядки не рухаються)", () => {
    expect(isSetCompleted({ weightKg: 60, reps: 8 })).toBe(true);
    expect(isSetCompleted({ weightKg: 60, reps: 8, done: null })).toBe(true);
    expect(isSetCompleted({ weightKg: 60, reps: 0, done: null })).toBe(false);
  });

  it("done: false прибирає рядок зі значеннями з підрахунку", () => {
    expect(isSetCompleted({ weightKg: 60, reps: 8, done: false })).toBe(false);
    expect(
      isSetCompleted(
        { weightKg: 0, reps: 0, durationSec: 30, done: false },
        { type: "time", measure: "time" },
      ),
    ).toBe(false);
  });

  it("done: true без лічильної величини не зараховано (прапорець не додає)", () => {
    expect(isSetCompleted({ weightKg: 60, reps: 0, done: true })).toBe(false);
    expect(isSetCompleted({ weightKg: 60, reps: 8, done: true })).toBe(true);
  });
});

describe("isWorkingSet — зарахований і не розминка", () => {
  it("розминка не робоча, дроп і «до відмови» — робочі", () => {
    const base = { weightKg: 40, reps: 10, done: true };
    expect(isWarmupSet({ ...base, setType: "warmup" })).toBe(true);
    expect(isWorkingSet({ ...base, setType: "warmup" })).toBe(false);
    expect(isWorkingSet({ ...base, setType: "drop" })).toBe(true);
    expect(isWorkingSet({ ...base, setType: "failure" })).toBe(true);
    expect(isWorkingSet({ ...base, setType: null })).toBe(true);
    expect(isWorkingSet({ ...base, done: false })).toBe(false);
  });
});

const WARMUP = { weightKg: 20, reps: 10, done: true, setType: "warmup" };
const UNDONE = { weightKg: 100, reps: 10, done: false };
const WORK = { weightKg: 60, reps: 5, done: true };

describe("споживачі: розминка й незроблене поза результатом", () => {
  const w = workout([WARMUP, UNDONE, WORK]);

  it("журнал: підходи, вправи, тоннаж", () => {
    expect(computeWorkoutSetCount(w)).toBe(1);
    expect(computeWorkoutTonnageKg(w)).toBe(300);
    expect(itemTonnageKg(w.items[0])).toBe(300);
    expect(computeWorkoutDoneItemCount(workout([WARMUP, UNDONE]))).toBe(0);
  });

  it("поріг повноцінного тренування не бере розминку", () => {
    const sets = Array.from({ length: 6 }, () => ({ ...WARMUP }));
    expect(isFullWorkout(workout(sets))).toBe(false);
    expect(
      isFullWorkout(workout(sets.map((s) => ({ ...s, setType: null })))),
    ).toBe(true);
  });

  it("рекорди 1RM і прогресія", () => {
    const pr = getExercisePR([w], "bench");
    expect(pr.bestSet).toEqual({ weightKg: 60, reps: 5 });
    expect(personalRecordsExerciseCount([workout([WARMUP, UNDONE])])).toBe(0);
    expect(countExercisePRs([workout([WARMUP, UNDONE])])).toBe(0);
    expect(progressionTopSet([WARMUP, UNDONE, WORK])).toBe(WORK);
    expect(computeTopPRs([workout([UNDONE, WORK])])[0]?.weightKg).toBe(60);
  });

  it("обʼєм за період, «Останні», сторінка вправи, давність 1RM", () => {
    const agg = calcFizrukPeriodAggregate([w], { start: 0 });
    expect(agg.totalVolumeKg).toBe(300);
    expect(listRecentCompletedWorkouts([w])[0]?.tonnageKg).toBe(300);
    const history = [
      { workout: w, item: w.items[0] },
    ] as unknown as ExerciseHistoryEntry[];
    expect(computeExerciseBest(history).bestSet?.weightKg).toBe(60);
    expect(computeExerciseWeeklyTrend(history).volPoints[0]?.value).toBe(300);
    expect(collectStrengthSessionPoints(history)[0]?.best1rm).toBeCloseTo(
      60 * (1 + 5 / 30),
    );
  });

  it("рекорд часу не бере розминку і незроблене", () => {
    const item = {
      id: "p",
      exerciseId: "plank",
      type: "time",
      measure: "time",
      sets: [
        { weightKg: 0, reps: 0, durationSec: 120, setType: "warmup" },
        { weightKg: 0, reps: 0, durationSec: 200, done: false },
        { weightKg: 0, reps: 0, durationSec: 60 },
      ],
    };
    const rec = getExerciseMeasureRecord(
      [{ startedAt: "2026-11-10T10:00:00.000Z", items: [item] }],
      "plank",
    );
    expect(rec?.best).toBe(60);
    // Відновлення (рішення власника): розминка лишається, незроблене — ні.
    expect(sumCompletedSets(item, "durationSec")).toBe(180);
  });

  it("відновлення рахує розминку, але не незроблене", () => {
    const withWarmup = loadPointsForItem({
      ...STRENGTH,
      sets: [WARMUP, WORK],
    } as never);
    const workOnly = loadPointsForItem({ ...STRENGTH, sets: [WORK] } as never);
    const withUndone = loadPointsForItem({
      ...STRENGTH,
      sets: [UNDONE, WORK],
    } as never);
    expect(withWarmup).toBeGreaterThan(workOnly);
    expect(withUndone).toBe(workOnly);
  });
});

describe("регресія: старі рядки без полів дають ті самі числа", () => {
  const legacy = workout([
    { weightKg: 20, reps: 10 },
    { weightKg: 60, reps: 5 },
    { weightKg: 60, reps: 0 },
  ]);
  it("підходи, тоннаж, рекорд, відновлення", () => {
    expect(computeWorkoutSetCount(legacy)).toBe(2);
    expect(computeWorkoutTonnageKg(legacy)).toBe(500);
    expect(getExercisePR([legacy], "bench").bestSet).toEqual({
      weightKg: 60,
      reps: 5,
    });
    expect(loadPointsForItem(legacy.items[0] as never)).toBeCloseTo(
      500 / 1000 + 2 * 0.15,
    );
  });
});

describe("калорії: незроблений рядок не забирає частку часу сесії", () => {
  it("час ділиться лише між рядками без done: false", async () => {
    const { computeWorkoutKcalBurned } =
      await import("../../lib/kcalBurned.js");
    const base = {
      startedAt: "2026-11-10T10:00:00.000Z",
      endedAt: "2026-11-10T11:00:00.000Z",
    };
    const a = { type: "strength", met: 6, sets: [WORK, WARMUP] };
    const planned = { type: "strength", met: 3, sets: [UNDONE, UNDONE] };
    const onlyA = computeWorkoutKcalBurned(
      { ...base, items: [a] } as never,
      80,
    );
    const withPlanned = computeWorkoutKcalBurned(
      { ...base, items: [a, planned] } as never,
      80,
    );
    expect(withPlanned).toBe(onlyA);
  });
});

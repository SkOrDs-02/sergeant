// @vitest-environment jsdom
/**
 * Last validated: 2026-09-13
 * Status: Active
 *
 * РЕГРЕСІЯ: разове тренування роздувало ПОСТІЙНУ ціль.
 *
 * Пресет «розрахувати з профілю» пише результат у `dailyTargetKcal` — і
 * доти брав спалене ЗА СЬОГОДНІ. Тобто людина, яка тиснула пресет після
 * важкого заняття, лишалась із роздутою ціллю назавжди, доки не змінить
 * її руками. Тест тримає саме цю межу: одне тренування не має права
 * піднімати середнє більш ніж на свою чесну частку вікна.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const workouts = vi.hoisted(() => ({ list: [] as unknown[] }));

vi.mock("../../modules/fizruk/hooks/useWorkouts", () => ({
  useWorkouts: () => ({ workouts: workouts.list }),
}));
vi.mock("./useLatestBodyWeight", () => ({
  useLatestBodyWeightKg: () => 80,
}));
vi.mock("@sergeant/fizruk-domain", () => ({
  // Стала оцінка: тест про ВІКНО і дільник, не про формулу витрат.
  computeWorkoutKcalBurned: () => 700,
}));

import {
  useAverageWorkoutKcalPerDay,
  WORKOUT_AVERAGE_WINDOW_DAYS,
} from "./useAverageWorkoutKcal";

function workoutAt(daysAgo: number) {
  return {
    startedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    endedAt: new Date(
      Date.now() - daysAgo * 86_400_000 + 3600_000,
    ).toISOString(),
  };
}

beforeEach(() => {
  workouts.list = [];
});

describe("useAverageWorkoutKcalPerDay", () => {
  it("одне тренування дає свою частку вікна, а не весь спалений обсяг", () => {
    workouts.list = [workoutAt(2)];
    const { result } = renderHook(() => useAverageWorkoutKcalPerDay());
    expect(result.current).toBeCloseTo(700 / WORKOUT_AVERAGE_WINDOW_DAYS, 5);
    // Суть фіксу одним рядком: постійна ціль не бачить 700 ккал.
    expect(result.current).toBeLessThan(100);
  });

  it("сьогоднішнє тренування у вікно не входить — день ще не прожитий", () => {
    workouts.list = [workoutAt(0)];
    const { result } = renderHook(() => useAverageWorkoutKcalPerDay());
    expect(result.current).toBe(0);
  });

  it("старіші за вікно не враховуються", () => {
    workouts.list = [workoutAt(WORKOUT_AVERAGE_WINDOW_DAYS + 5)];
    const { result } = renderHook(() => useAverageWorkoutKcalPerDay());
    expect(result.current).toBe(0);
  });

  it("незавершена сесія не рахується", () => {
    workouts.list = [{ ...workoutAt(2), endedAt: null }];
    const { result } = renderHook(() => useAverageWorkoutKcalPerDay());
    expect(result.current).toBe(0);
  });

  it("регулярні тренування дають відчутне середнє", () => {
    workouts.list = [1, 3, 5, 7, 9, 11].map(workoutAt);
    const { result } = renderHook(() => useAverageWorkoutKcalPerDay());
    expect(result.current).toBeCloseTo(
      (700 * 6) / WORKOUT_AVERAGE_WINDOW_DAYS,
      5,
    );
  });
});

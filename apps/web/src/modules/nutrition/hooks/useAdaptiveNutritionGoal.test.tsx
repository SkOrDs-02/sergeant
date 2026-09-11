/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Регресія N8: автокалібрування ставило ПЕРШУ денну ціль, не передавши
 * `workoutKcal` у `computeNutritionTargetsFromBiometrics`. При
 * `countWorkoutsInGoal: true` множник активності свідомо опускається до
 * `sedentary` (`lib/tdee.ts:135-148`), а спалене мало приходити явним
 * доданком — і не приходило, тож перша ціль виходила заниженою рівно для
 * тих, хто тренується.
 *
 * Другий бік тієї ж правки — вага: `weights.at(-1)` брало НАЙСТАРІШУ
 * точку вікна, бо `collectWeights` наповнює `Map` у порядку кешу fizruk
 * (newest-first).
 */
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const biometricsMock = vi.hoisted(() => ({
  value: {
    heightCm: 180,
    birthDate: "1990-01-01",
    sex: "male" as const,
    activityLevel: "moderate" as const,
    weightKg: 80,
    weightUpdatedAt: null,
    countWorkoutsInGoal: false,
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
}));

const fizrukMock = vi.hoisted(() => ({
  workouts: [] as unknown[],
  measurements: [] as unknown[],
  dailyLog: [] as unknown[],
}));

const persisted = vi.hoisted(() => ({ profile: [] as unknown[] }));

vi.mock("../../../core/profile/useBiometrics", () => ({
  useBiometrics: () => ({
    biometrics: biometricsMock.value,
    saveBiometrics: vi.fn(),
  }),
}));

vi.mock("../../fizruk/lib/sqliteReader", () => ({
  getCachedFizrukSqliteState: () => ({
    workouts: fizrukMock.workouts,
    measurements: fizrukMock.measurements,
    dailyLog: fizrukMock.dailyLog,
    customExercises: [],
    customActivities: [],
    monthlyPlan: null,
    workoutTemplates: [],
    injuries: [],
  }),
}));

vi.mock("../lib/nutritionStorage", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/nutritionStorage")
  >("../lib/nutritionStorage");
  return {
    ...actual,
    persistProfileNutritionPrefs: (prefs: unknown) => {
      persisted.profile.push(prefs);
      return true;
    },
    persistAdaptiveNutritionPrefs: () => true,
  };
});

import type { NutritionLog, NutritionPrefs } from "@sergeant/nutrition-domain";
import {
  __resetAdaptiveGoalScheduleForTests,
  useAdaptiveNutritionGoal,
} from "./useAdaptiveNutritionGoal";

// `NutritionLog` — це `Record<dayKey, NutritionDay>`, тож порожній журнал
// це порожній обʼєкт, а не обгортка з полем `days`.
const EMPTY_LOG: NutritionLog = {};

function basePrefs(): NutritionPrefs {
  return {
    dailyTargetKcal: null,
    dailyTargetProtein_g: null,
    dailyTargetFat_g: null,
    dailyTargetCarbs_g: null,
    adaptiveGoalEnabled: true,
    adaptiveGoalIntent: "maintenance",
    adaptiveGoalLastUpdatedAt: null,
  } as unknown as NutritionPrefs;
}

function Probe({ prefs }: { prefs: NutritionPrefs }) {
  useAdaptiveNutritionGoal(EMPTY_LOG, prefs);
  return null;
}

/** Ккал, які автокалібрування записало першим seed-ом. */
function seededKcal(): number | null {
  const last = persisted.profile.at(-1) as
    { dailyTargetKcal?: number } | undefined;
  return last?.dailyTargetKcal ?? null;
}

function workoutAt(dateKey: string, kcalBurned: number) {
  return {
    id: `w-${dateKey}`,
    startedAt: `${dateKey}T09:00:00.000Z`,
    endedAt: `${dateKey}T10:00:00.000Z`,
    kcalBurned,
    items: [],
  };
}

function dayKeyDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

describe("useAdaptiveNutritionGoal · seed цілі", () => {
  beforeEach(() => {
    persisted.profile = [];
    fizrukMock.workouts = [];
    fizrukMock.measurements = [];
    fizrukMock.dailyLog = [];
    biometricsMock.value = {
      ...biometricsMock.value,
      countWorkoutsInGoal: false,
    };
    localStorage.clear();
    __resetAdaptiveGoalScheduleForTests();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("у статичному режимі тренування не змінюють першу ціль", () => {
    render(<Probe prefs={basePrefs()} />);
    const withoutWorkouts = seededKcal();

    persisted.profile = [];
    __resetAdaptiveGoalScheduleForTests();
    fizrukMock.workouts = [
      workoutAt(dayKeyDaysAgo(2), 700),
      workoutAt(dayKeyDaysAgo(4), 700),
    ];
    render(<Probe prefs={basePrefs()} />);

    // `countWorkoutsInGoal: false` — витрати вже сидять у множнику рівня
    // активності, тож додавати їх удруге не можна.
    expect(seededKcal()).toBe(withoutWorkouts);
  });

  it("у динамічному режимі тренування піднімають першу ціль", () => {
    biometricsMock.value = {
      ...biometricsMock.value,
      countWorkoutsInGoal: true,
    };

    render(<Probe prefs={basePrefs()} />);
    const noWorkouts = seededKcal();
    expect(noWorkouts).not.toBeNull();

    persisted.profile = [];
    __resetAdaptiveGoalScheduleForTests();
    // 14-денне вікно: 4 сесії по 700 ккал дають +200 ккал/добу.
    fizrukMock.workouts = [2, 4, 6, 8].map((d) =>
      workoutAt(dayKeyDaysAgo(d), 700),
    );
    render(<Probe prefs={basePrefs()} />);
    const withWorkouts = seededKcal();

    expect(withWorkouts).not.toBeNull();
    expect(withWorkouts!).toBeGreaterThan(noWorkouts!);
  });

  it("бере найсвіжішу вагу вікна, а не останній елемент масиву", () => {
    // Кеш fizruk віддає newest-first, тож `weights.at(-1)` дало б 70 кг.
    fizrukMock.measurements = [
      { at: `${dayKeyDaysAgo(1)}T08:00:00.000Z`, weightKg: 95 },
      { at: `${dayKeyDaysAgo(9)}T08:00:00.000Z`, weightKg: 70 },
    ];
    render(<Probe prefs={basePrefs()} />);
    const heavier = seededKcal();

    persisted.profile = [];
    __resetAdaptiveGoalScheduleForTests();
    fizrukMock.measurements = [
      { at: `${dayKeyDaysAgo(1)}T08:00:00.000Z`, weightKg: 70 },
      { at: `${dayKeyDaysAgo(9)}T08:00:00.000Z`, weightKg: 95 },
    ];
    render(<Probe prefs={basePrefs()} />);
    const lighter = seededKcal();

    expect(heavier).not.toBeNull();
    expect(lighter).not.toBeNull();
    expect(heavier!).toBeGreaterThan(lighter!);
  });
});

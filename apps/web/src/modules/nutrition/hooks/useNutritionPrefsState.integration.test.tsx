// @vitest-environment jsdom
/**
 * Last validated: 2026-10-03
 * Status: Active
 *
 * data-04, інтеграція на РЕАЛЬНИХ хуках і сховищі: батько з
 * `useNutritionPrefsState` + дитина з `useAdaptiveNutritionGoal` (як
 * `NutritionApp` → `NutritionDashboard`). Мокаються лише тригер dual-write
 * (мережа/SQLite) і зовнішні джерела біометрії та fizruk.
 *
 * Регресія: React запускає ефекти дитини раніше за батька, тож дитина
 * (автокалібрування) спершу писала ціль, а батьків ефект слідом писав ЗАСТАРІЛИЙ
 * цілий стан (`dailyTargetKcal: null`) — це відкочувало ціль і вимикало
 * автокалібрування (`goalChanged` + origin `manual`).
 */
import { useEffect } from "react";
import { render, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface TriggerCall {
  prevKcal: number | null;
  nextKcal: number | null;
  nextAdaptive: boolean;
  goalOrigin: string | undefined;
  nextPrefsJson: string;
}
const triggers = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock("../lib/sqliteWriter/index", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/sqliteWriter/index")
  >("../lib/sqliteWriter/index");
  return {
    ...actual,
    triggerNutritionDualWrite: (
      prev: { prefs: { prefsJson: string } | null },
      next: { prefs: { prefsJson: string } | null; goalOrigin?: string },
    ) => {
      const p = prev.prefs ? JSON.parse(prev.prefs.prefsJson) : {};
      const n = next.prefs ? JSON.parse(next.prefs.prefsJson) : {};
      triggers.calls.push({
        prevKcal: p.dailyTargetKcal ?? null,
        nextKcal: n.dailyTargetKcal ?? null,
        nextAdaptive: n.adaptiveGoalEnabled,
        goalOrigin: next.goalOrigin,
        nextPrefsJson: next.prefs?.prefsJson ?? "",
      } satisfies TriggerCall);
    },
  };
});

vi.mock("../../../core/profile/useBiometrics", () => ({
  useBiometrics: () => ({
    biometrics: {
      heightCm: 180,
      birthDate: "1990-01-01",
      sex: "male" as const,
      activityLevel: "moderate" as const,
      weightKg: 80,
      weightUpdatedAt: null,
      countWorkoutsInGoal: false,
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    saveBiometrics: vi.fn(),
  }),
}));
vi.mock("../../fizruk/lib/sqliteReader", () => ({
  getCachedFizrukSqliteState: () => ({
    workouts: [],
    measurements: [],
    dailyLog: [],
    customExercises: [],
    customActivities: [],
    monthlyPlan: null,
    workoutTemplates: [],
    injuries: [],
  }),
}));

import {
  defaultNutritionPrefs,
  type NutritionLog,
} from "@sergeant/nutrition-domain";
import {
  __resetInitialPullStateForTests,
  markInitialPullComplete,
} from "../../../core/syncEngine/initialPullState";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../lib/sqliteReader";
import { useNutritionPrefsState } from "./useNutritionPrefsState";
import {
  __resetAdaptiveGoalScheduleForTests,
  useAdaptiveNutritionGoal,
} from "./useAdaptiveNutritionGoal";

const EMPTY_LOG: NutritionLog = {};

function Child({ prefs }: { prefs: ReturnType<typeof defaultNutritionPrefs> }) {
  useAdaptiveNutritionGoal(EMPTY_LOG, prefs);
  return null;
}

const handle: { state: ReturnType<typeof useNutritionPrefsState> | null } = {
  state: null,
};

function Parent({ tick }: { tick: number }) {
  const state = useNutritionPrefsState(tick);
  useEffect(() => {
    handle.state = state;
  });
  return <Child prefs={state.prefs} />;
}

const calls = () => triggers.calls as TriggerCall[];

describe("useNutritionPrefsState + useAdaptiveNutritionGoal (data-04)", () => {
  beforeEach(() => {
    triggers.calls = [];
    handle.state = null;
    clearNutritionSqliteCache();
    __resetInitialPullStateForTests();
    __resetAdaptiveGoalScheduleForTests();
  });
  afterEach(() => {
    clearNutritionSqliteCache();
    __resetInitialPullStateForTests();
  });

  it("маунт на гідратованому кеші без цілі: ціль не відкочується, автокалібрування лишається ввімкненим", () => {
    __setNutritionSqliteCacheForTests({
      prefs: {
        ...defaultNutritionPrefs(),
        dailyTargetKcal: null,
        adaptiveGoalEnabled: true,
      },
    });
    render(<Parent tick={0} />);

    // Рівно один запис — seed цілі від автокалібрування, і він остаточний.
    expect(calls()).toHaveLength(1);
    expect(calls()[0]!.prevKcal).toBeNull();
    expect(calls()[0]!.nextKcal).toBeGreaterThan(0);
    expect(calls()[0]!.nextAdaptive).toBe(true);
    expect(calls()[0]!.goalOrigin).toBe("preset");
  });

  it("pull завершується, поки екран відкритий: нічого не пишеться з дефолтів, далі лише seed цілі", () => {
    // Кеш прогрітий, але рядка prefs немає, і pull ще не завершено.
    __setNutritionSqliteCacheForTests({});
    const { rerender } = render(<Parent tick={0} />);
    expect(calls()).toHaveLength(0);

    act(() => {
      markInitialPullComplete("user-1", {});
    });
    rerender(<Parent tick={0} />);

    // Новий акаунт: pull не приніс prefs, дитина ставить першу ціль. Батько
    // нічого не дописує поверх неї.
    expect(calls()).toHaveLength(1);
    expect(calls()[0]!.nextKcal).toBeGreaterThan(0);
    expect(calls()[0]!.nextAdaptive).toBe(true);
    const finalPrefs = JSON.parse(calls()[0]!.nextPrefsJson);
    expect(finalPrefs.dailyTargetKcal).toBe(calls()[0]!.nextKcal);
  });

  it("дія користувача пише лише змінене поле на актуальний стан (ціль автокалібрування не відкочується)", () => {
    __setNutritionSqliteCacheForTests({
      prefs: {
        ...defaultNutritionPrefs(),
        dailyTargetKcal: null,
        adaptiveGoalEnabled: true,
      },
    });
    render(<Parent tick={0} />);
    const seeded = calls()[0]!.nextKcal;

    act(() => {
      handle.state!.setPrefs((p) => ({ ...p, servings: p.servings + 1 }));
    });

    expect(calls()).toHaveLength(2);
    const last = JSON.parse(calls()[1]!.nextPrefsJson);
    expect(last.dailyTargetKcal).toBe(seeded);
    expect(last.adaptiveGoalEnabled).toBe(true);
  });
});

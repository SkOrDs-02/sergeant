/** @vitest-environment jsdom */
/**
 * Last validated: 2026-10-02
 * Status: Active
 *
 * Контракт data-04 наскрізно (справжні `nutritionStorage` + diff, без мока
 * storage): новий пристрій, біометрія вже є з `/api/me/profile`, а prefs акаунта
 * ще в дорозі. Холодний старт без жодної дії користувача не має породити
 * жодного опа `nutrition_prefs`; після першого pull правки пишуться патчем
 * поверх актуального кешу, а не цілим дефолтним blob-ом.
 */
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const triggerSpy = vi.fn();

vi.mock("../lib/sqliteWriter/index", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/sqliteWriter/index")
  >("../lib/sqliteWriter/index");
  return {
    ...actual,
    triggerNutritionDualWrite: (...args: unknown[]) => triggerSpy(...args),
  };
});

vi.mock("../../../core/profile/useBiometrics", () => ({
  useBiometrics: () => ({
    biometrics: {
      heightCm: 180,
      birthDate: "1990-01-01",
      sex: "male",
      activityLevel: "moderate",
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

import type { NutritionLog, NutritionPrefs } from "@sergeant/nutrition-domain";
import {
  __resetInitialPullStateForTests,
  markInitialPullComplete,
} from "../../../core/syncEngine/initialPullState";
import { defaultNutritionPrefs } from "../lib/nutritionStorage";
import { diffNutritionDualWriteOps } from "../lib/sqliteWriter/diff";
import { notifyNutritionSqliteCacheRefresh } from "../lib/sqliteReadGate";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../lib/sqliteReader";
import {
  __resetAdaptiveGoalScheduleForTests,
  useAdaptiveNutritionGoal,
} from "./useAdaptiveNutritionGoal";

const EMPTY_LOG: NutritionLog = {};

const template = {
  id: "t1",
  name: "Сніданок",
  mealType: "breakfast" as const,
  macros: { kcal: 400, protein_g: 20, fat_g: 10, carbs_g: 50 },
};

/** Стан компонента, як його бачить Їжа на холодному кеші: дефолти. */
function Probe({ prefs }: { prefs: NutritionPrefs }) {
  useAdaptiveNutritionGoal(EMPTY_LOG, prefs);
  return null;
}

function prefsOps(): { prefs: { prefsJson: string } }[] {
  return triggerSpy.mock.calls.flatMap(([prev, next]) =>
    diffNutritionDualWriteOps(prev, next).filter(
      (op) => op.kind === "prefs-upsert",
    ),
  ) as { prefs: { prefsJson: string } }[];
}

beforeEach(() => {
  localStorage.clear();
  clearNutritionSqliteCache();
  __resetInitialPullStateForTests();
  __resetAdaptiveGoalScheduleForTests();
  triggerSpy.mockReset();
});

afterEach(() => {
  clearNutritionSqliteCache();
  __resetInitialPullStateForTests();
});

describe("data-04: новий пристрій — біометрія є, prefs ще не приїхали", () => {
  it("холодний старт без дій користувача не породжує жодного опа prefs", () => {
    // Локальний бут завершився з порожньою базою (refreshedAt заповнено), рядка
    // prefs нема, pull ще не йшов.
    __setNutritionSqliteCacheForTests({});
    render(<Probe prefs={defaultNutritionPrefs()} />);
    expect(triggerSpy).not.toHaveBeenCalled();
    expect(prefsOps()).toEqual([]);
  });

  it("pull приніс prefs акаунта з ручною ціллю: seed не перетирає їх", () => {
    __setNutritionSqliteCacheForTests({});
    const view = render(<Probe prefs={defaultNutritionPrefs()} />);

    // Pull завершився: кеш отримав рядок prefs, прапор виставлено, тік пішов.
    const account = {
      ...defaultNutritionPrefs(),
      dailyTargetKcal: 2100,
      adaptiveGoalEnabled: false,
      waterGoalMl: 2750,
      reminderEnabled: true,
      mealTemplates: [template],
    };
    __setNutritionSqliteCacheForTests({ prefs: account });
    markInitialPullComplete("u1", {});
    act(() => notifyNutritionSqliteCacheRefresh());
    view.rerender(<Probe prefs={account} />);

    expect(prefsOps()).toEqual([]);
  });

  it("акаунт без рядка prefs: після pull seed пишеться патчем, шаблони/вода/нагадування не чіпаються", () => {
    __setNutritionSqliteCacheForTests({});
    const view = render(<Probe prefs={defaultNutritionPrefs()} />);
    expect(prefsOps()).toEqual([]);

    markInitialPullComplete("u1", {});
    act(() => notifyNutritionSqliteCacheRefresh());
    view.rerender(<Probe prefs={defaultNutritionPrefs()} />);

    const ops = prefsOps();
    expect(ops).toHaveLength(1);
    const written = JSON.parse(ops[0]!.prefs.prefsJson) as Record<
      string,
      unknown
    >;
    expect(written["dailyTargetKcal"]).toBeTypeOf("number");
    expect(written["mealTemplates"]).toEqual([]);
    expect(written["waterGoalMl"]).toBe(2000);
  });
});

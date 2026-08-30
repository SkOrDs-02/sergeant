// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  todayISODate,
  type NutritionLog,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";
import { __resetHubBusForTests, onHubBus } from "@shared/lib/modules/hubBus";
import { writeNutritionQuickStatsSnapshot } from "./useNutritionQuickStatsWriter";

// ADR-0078: the writer reads "today"'s kcal off the device-local day key.
function logWithKcal(kcal: number): NutritionLog {
  return {
    [todayISODate()]: {
      meals: [
        {
          id: "m1",
          name: "Тестова страва",
          time: "12:00",
          macros: { kcal, protein_g: 0, fat_g: 0, carbs_g: 0 },
        },
      ],
    },
  } as unknown as NutritionLog;
}

describe("writeNutritionQuickStatsSnapshot", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetHubBusForTests();
  });

  afterEach(() => {
    localStorage.clear();
    __resetHubBusForTests();
  });

  it("persists today's kcal and notifies the Hub once per change", () => {
    const updated = vi.fn();
    onHubBus("storageUpdated", updated);

    const payload = writeNutritionQuickStatsSnapshot({
      log: logWithKcal(640),
      prefs: { dailyTargetKcal: 1800 } as NutritionPrefs,
    });

    expect(JSON.parse(payload)).toEqual({ todayCal: 640, calGoal: 1800 });
    expect(localStorage.getItem(STORAGE_KEYS.NUTRITION_QUICK_STATS)).toBe(
      payload,
    );
    expect(updated).toHaveBeenCalledTimes(1);

    // Ідентичний повторний виклик не має будити споживачів хаба.
    writeNutritionQuickStatsSnapshot({
      log: logWithKcal(640),
      prefs: { dailyTargetKcal: 1800 } as NutritionPrefs,
    });
    expect(updated).toHaveBeenCalledTimes(1);
  });

  it("records the kcal but no goal when the user has not set one", () => {
    // Ціль користувач не задавав — теплий SQLite-кеш віддає `prefs: null`.
    // Зʼїдені калорії це виміряний факт, тож картка їх показує; вигадувати
    // «дефолтні 2000» не можна — саме за це прибрано фолбек у
    // recommendationEngine (browser QA 2026-08-04, F-010). `calGoal: 0` —
    // сигнал для `selectModulePreview` не рендерити рядок «Ціль: …».
    const payload = writeNutritionQuickStatsSnapshot({
      log: logWithKcal(640),
      prefs: null,
    });

    expect(JSON.parse(payload)).toEqual({ todayCal: 640, calGoal: 0 });
  });
});

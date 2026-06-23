/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Shared in-memory store for all four mocked module-storage backends.
const store = new Map<string, unknown>();

function makeModuleStorage() {
  return {
    readJSON: <T>(key: string, fallback: T): T =>
      store.has(key) ? (store.get(key) as T) : fallback,
    writeJSON: (key: string, value: unknown): void => {
      store.set(key, value);
    },
    writeRaw: (key: string, value: string): void => {
      store.set(key, value);
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
  };
}

vi.mock("@finyk/lib/finykStorage", () => {
  const s = makeModuleStorage();
  return {
    readJSON: s.readJSON,
    writeJSON: s.writeJSON,
    writeRaw: s.writeRaw,
  };
});
vi.mock("@fizruk/lib/fizrukStorageInstance", () => ({
  fizrukStorage: makeModuleStorage(),
}));
vi.mock("@nutrition/lib/nutritionStorageInstance", () => ({
  nutritionStorage: makeModuleStorage(),
}));
vi.mock("@routine/lib/routineStorageInstance", () => ({
  routineStorage: makeModuleStorage(),
}));

import { applyPreset } from "./presetApply";

const FINYK_MANUAL_EXPENSES_KEY = "finyk_manual_expenses_v1";
const FINYK_MANUAL_ONLY_KEY = "finyk_manual_only_v1";
const ROUTINE_STATE_KEY = "hub_routine_v1";
const FIZRUK_WORKOUTS_KEY = "fizruk_workouts_v1";
const NUTRITION_LOG_KEY = "nutrition_log_v1";

describe("applyPreset", () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00Z"));
    store.clear();
    dispatchSpy = vi
      .spyOn(window, "dispatchEvent")
      .mockReturnValue(true) as never;
    vi.stubGlobal("crypto", {
      randomUUID: () => "00000000-0000-0000-0000-000000000000",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    dispatchSpy.mockRestore();
  });

  it("ignores an unknown module id", () => {
    // @ts-expect-error invalid module id intentionally
    applyPreset("unknown", { name: "x" });
    expect(store.size).toBe(0);
  });

  it("writes a finyk expense and the manual-only flag", () => {
    applyPreset("finyk", {
      description: "Coffee",
      amount: 5000,
      category: "food",
    });
    const list = store.get(FINYK_MANUAL_EXPENSES_KEY) as Array<{
      demo: boolean;
      description: string;
      amount: number;
    }>;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      demo: false,
      description: "Coffee",
      amount: 5000,
      category: "food",
    });
    expect(store.get(FINYK_MANUAL_ONLY_KEY)).toBe("1");
  });

  it("prepends to an existing finyk list", () => {
    store.set(FINYK_MANUAL_EXPENSES_KEY, [{ id: "old" }]);
    applyPreset("finyk", { description: "Tea", amount: 100, category: "food" });
    const list = store.get(FINYK_MANUAL_EXPENSES_KEY) as unknown[];
    expect(list).toHaveLength(2);
    expect((list[1] as { id: string }).id).toBe("old");
  });

  it("creates a routine habit and dispatches the change event", () => {
    applyPreset("routine", { name: "Stretch", emoji: "🤸" });
    const state = store.get(ROUTINE_STATE_KEY) as {
      habits: Array<{ name: string; emoji: string; demo: boolean }>;
      habitOrder: string[];
      schemaVersion: number;
    };
    expect(state.habits).toHaveLength(1);
    expect(state.habits[0]).toMatchObject({
      name: "Stretch",
      emoji: "🤸",
      demo: false,
      recurrence: "daily",
    });
    expect(state.habitOrder).toHaveLength(1);
    expect(state.schemaVersion).toBe(3);
    expect(dispatchSpy).toHaveBeenCalled();
  });

  it("falls back to a default emoji and appends to existing routine habits", () => {
    store.set(ROUTINE_STATE_KEY, {
      habits: [{ id: "h0" }],
      habitOrder: ["h0"],
      prefs: { custom: true },
    });
    applyPreset("routine", { name: "Walk" });
    const state = store.get(ROUTINE_STATE_KEY) as {
      habits: Array<{ emoji: string }>;
      habitOrder: string[];
      prefs: { custom: boolean };
    };
    expect(state.habits).toHaveLength(2);
    expect(state.habits[1]!.emoji).toBe("✓");
    expect(state.habitOrder).toHaveLength(2);
    expect(state.prefs).toEqual({ custom: true });
  });

  it("creates a fizruk workout with a derived start time", () => {
    applyPreset("fizruk", { name: "Run", durationMin: 30 });
    const wo = store.get(FIZRUK_WORKOUTS_KEY) as {
      workouts: Array<{ name: string; durationSec: number; demo: boolean }>;
    };
    expect(wo.workouts).toHaveLength(1);
    expect(wo.workouts[0]).toMatchObject({
      name: "Run",
      durationSec: 1800,
      demo: false,
    });
  });

  it("reads fizruk workouts from a legacy array shape", () => {
    store.set(FIZRUK_WORKOUTS_KEY, [{ id: "old-wo" }]);
    applyPreset("fizruk", { name: "Bike", durationMin: 10 });
    const wo = store.get(FIZRUK_WORKOUTS_KEY) as {
      workouts: Array<{ id?: string }>;
    };
    expect(wo.workouts).toHaveLength(2);
  });

  it("creates a nutrition meal with computed macros", () => {
    applyPreset("nutrition", { name: "Apple", kcal: 100, mealType: "snack" });
    const log = store.get(NUTRITION_LOG_KEY) as Record<
      string,
      { meals: Array<{ name: string; macros: { kcal: number } }> }
    >;
    const day = Object.values(log)[0]!;
    expect(day.meals).toHaveLength(1);
    expect(day.meals[0]).toMatchObject({
      name: "Apple",
      mealType: "snack",
    });
    expect(day.meals[0]!.macros.kcal).toBe(100);
  });

  it("appends a nutrition meal to an existing day", () => {
    applyPreset("nutrition", { name: "A", kcal: 50 });
    applyPreset("nutrition", { name: "B", kcal: 60 });
    const log = store.get(NUTRITION_LOG_KEY) as Record<
      string,
      { meals: unknown[] }
    >;
    const day = Object.values(log)[0]!;
    expect(day.meals).toHaveLength(2);
  });
});

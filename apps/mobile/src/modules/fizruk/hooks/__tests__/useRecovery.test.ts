/**
 * Unit tests for `useRecovery` — mobile port.
 *
 * Tests the key mapping: "last workout N days ago → recovery status"
 * by feeding known workouts / daily-log entries into the hook and
 * asserting on the resulting `by`, `ready`, and `avoid` lists.
 */
import { renderHook } from "@testing-library/react-native";

import { _getMMKVInstance, safeWriteLS } from "@/lib/storage";
import { STORAGE_KEYS } from "@sergeant/shared";

import type { Workout } from "@sergeant/fizruk-domain";

import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../../lib/sqliteReader";
import { useRecovery } from "../useRecovery";

beforeEach(() => {
  _getMMKVInstance().clearAll();
  clearFizrukSqliteCache();
});

describe("useRecovery", () => {
  it("returns no avoid-list items when no workouts exist", () => {
    const { result } = renderHook(() => useRecovery());
    expect(result.current.avoid.length).toBe(0);
    expect(result.current.wellbeingMult).toBe(1.0);
    for (const m of result.current.list) {
      expect(m.status).toBe("green");
    }
  });

  it("marks a muscle trained today as red", () => {
    const now = new Date();
    const workout: Workout = {
      id: "w1",
      startedAt: now.toISOString(),
      endedAt: now.toISOString(),
      items: [
        {
          id: "i1",
          exerciseId: "bench-press",
          nameUk: "Жим лежачи",
          primaryGroup: "chest",
          musclesPrimary: ["chest"],
          musclesSecondary: ["triceps"],
          type: "strength",
          sets: [{ weightKg: 80, reps: 10 }],
        },
      ],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
    };

    // Stage 8 PR #057f-tombstone: hooks read from SQLite cache,
    // not MMKV. Seed the cache directly.
    __setFizrukSqliteCacheForTests({ workouts: [workout] });

    const { result } = renderHook(() => useRecovery());

    expect(result.current.by.chest).toBeDefined();
    expect(result.current.by.chest!.status).toBe("red");
    expect(result.current.by.chest!.daysSince).toBe(0);
    expect(result.current.avoid.some((m) => m.id === "chest")).toBe(true);
  });

  it("marks a muscle trained 5+ days ago as green", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const workout: Workout = {
      id: "w2",
      startedAt: fiveDaysAgo.toISOString(),
      endedAt: fiveDaysAgo.toISOString(),
      items: [
        {
          id: "i2",
          exerciseId: "squat",
          nameUk: "Присід",
          primaryGroup: "legs",
          musclesPrimary: ["quadriceps"],
          musclesSecondary: [],
          type: "strength",
          sets: [{ weightKg: 60, reps: 8 }],
        },
      ],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
    };

    __setFizrukSqliteCacheForTests({ workouts: [workout] });

    const { result } = renderHook(() => useRecovery());

    expect(result.current.by.quadriceps).toBeDefined();
    expect(result.current.by.quadriceps!.status).toBe("green");
    expect(result.current.by.quadriceps!.daysSince).toBeGreaterThanOrEqual(4);
    expect(result.current.avoid.some((m) => m.id === "quadriceps")).toBe(false);
  });

  it("wellbeing multiplier reflects poor sleep", () => {
    const dailyLog = [
      {
        id: "dl1",
        at: new Date().toISOString(),
        sleepHours: 4,
        energyLevel: 2,
        weightKg: null,
        mood: null,
        note: "",
      },
    ];

    safeWriteLS(STORAGE_KEYS.FIZRUK_DAILY_LOG, dailyLog);

    const { result } = renderHook(() => useRecovery());

    expect(result.current.wellbeingMult).toBeGreaterThan(1.0);
  });
});

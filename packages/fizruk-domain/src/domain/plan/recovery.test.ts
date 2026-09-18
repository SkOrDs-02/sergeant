import { describe, expect, it } from "vitest";

import type { Workout } from "../types.js";
import {
  computeRecoveryForecast,
  describeDayRecovery,
  type DayRecoveryForecast,
} from "./recovery.js";

const MUSCLES_UK: Record<string, string> = {
  chest: "Груди",
  triceps: "Трицепс",
  shoulders: "Дельти",
  legs_quads: "Квадрицепси",
  legs_hams: "Біцепс стегна",
  back: "Спина",
  biceps: "Біцепс",
};

function mkStrengthWorkout(
  id: string,
  startedAt: string,
  items: Array<{
    id?: string;
    exerciseId?: string;
    primary: string[];
    secondary?: string[];
    sets?: Array<{ weightKg: number; reps: number }>;
  }>,
): Partial<Workout> {
  return {
    id,
    startedAt,
    endedAt: startedAt,
    items: items.map((it, i) => ({
      id: it.id ?? `${id}_it_${i}`,
      exerciseId: it.exerciseId ?? `ex_${i}`,
      nameUk: "Demo",
      primaryGroup: it.primary[0] ?? "other",
      musclesPrimary: it.primary,
      musclesSecondary: it.secondary ?? [],
      type: "strength",
      sets: it.sets ?? [
        { weightKg: 60, reps: 8 },
        { weightKg: 60, reps: 8 },
        { weightKg: 60, reps: 8 },
      ],
    })),
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
  };
}

function isoAtLocal(y: number, m: number, d: number, h = 18, min = 0): string {
  return new Date(y, m, d, h, min, 0, 0).toISOString();
}

describe("computeRecoveryForecast", () => {
  it("returns an empty map for empty dateKeys", () => {
    const out = computeRecoveryForecast([], [], MUSCLES_UK);
    expect(out).toEqual({});
  });

  it("marks every day 'fresh' when there is no workout history", () => {
    const keys = ["2025-03-01", "2025-03-02", "2025-03-03"];
    const out = computeRecoveryForecast(keys, [], MUSCLES_UK, {
      nowMs: new Date(2025, 2, 3, 20).getTime(),
    });
    for (const k of keys) {
      expect(out[k]?.status).toBe("fresh");
      expect(out[k]?.noRecentTraining).toBe(true);
      expect(out[k]?.overworkedMuscles).toEqual([]);
      expect(out[k]?.recoveredMuscles).toEqual([]);
    }
  });

  it("classifies the day after a heavy chest workout as 'overworked'", () => {
    const workouts = [
      mkStrengthWorkout("w1", isoAtLocal(2025, 2, 10), [
        {
          primary: ["chest"],
          secondary: ["triceps", "shoulders"],
          sets: [
            { weightKg: 80, reps: 8 },
            { weightKg: 80, reps: 8 },
            { weightKg: 80, reps: 8 },
            { weightKg: 80, reps: 8 },
          ],
        },
      ]),
    ];

    const out = computeRecoveryForecast(["2025-03-10"], workouts, MUSCLES_UK, {
      nowMs: new Date(2025, 2, 10, 23).getTime(),
    });
    const f = out["2025-03-10"];
    expect(f?.status).toBe("overworked");
    expect(f?.overworkedMuscles.map((m) => m.id)).toContain("chest");
    expect(f?.noRecentTraining).toBe(false);
  });

  it("transitions 'overworked' → 'ready' → 'fresh' over ~2 weeks", () => {
    const workouts = [
      mkStrengthWorkout("w1", isoAtLocal(2025, 2, 10), [
        {
          primary: ["chest", "triceps"],
          sets: [
            { weightKg: 80, reps: 8 },
            { weightKg: 80, reps: 8 },
            { weightKg: 80, reps: 8 },
          ],
        },
      ]),
    ];

    const keys = ["2025-03-10", "2025-03-11", "2025-03-14", "2025-03-20"];
    const out = computeRecoveryForecast(keys, workouts, MUSCLES_UK, {
      nowMs: new Date(2025, 2, 20).getTime(),
    });

    expect(out["2025-03-10"]?.status).toBe("overworked");
    expect(out["2025-03-11"]?.status).toBe("overworked");
    // By day 4 fatigue decay drops chest below red.
    expect(out["2025-03-14"]?.status === "ready").toBeTruthy();
    // By day 10 no muscle is within the 7-day fresh window → fresh.
    expect(out["2025-03-20"]?.status).toBe("fresh");
  });

  it("treats future workouts as not-yet-done when forecasting past days", () => {
    // Workout is logged for 2025-03-12, forecast 2025-03-10 should be
    // 'fresh' — it can't see the future entry yet.
    const workouts = [
      mkStrengthWorkout("w1", isoAtLocal(2025, 2, 12), [
        { primary: ["chest"], secondary: ["triceps"] },
      ]),
    ];
    const out = computeRecoveryForecast(
      ["2025-03-10", "2025-03-12"],
      workouts,
      MUSCLES_UK,
      { nowMs: new Date(2025, 2, 12, 20).getTime() },
    );
    expect(out["2025-03-10"]?.status).toBe("fresh");
    expect(out["2025-03-12"]?.status).toBe("overworked");
  });

  it("aggregates supersets (multiple items, same day) into a single status", () => {
    const workouts = [
      mkStrengthWorkout("w1", isoAtLocal(2025, 2, 15), [
        { primary: ["chest"], secondary: ["triceps"] },
        { primary: ["triceps"] },
        { primary: ["shoulders"] },
      ]),
    ];
    const out = computeRecoveryForecast(["2025-03-15"], workouts, MUSCLES_UK, {
      nowMs: new Date(2025, 2, 15, 22).getTime(),
    });
    const f = out["2025-03-15"];
    expect(f?.status).toBe("overworked");
    // Three distinct primary muscles all hit today → all red.
    const redIds = f?.overworkedMuscles.map((m) => m.id) ?? [];
    expect(redIds).toEqual(
      expect.arrayContaining(["chest", "triceps", "shoulders"]),
    );
  });

  it("respects custom freshThresholdDays", () => {
    // Same single chest workout, but the user asks only 3 days back to
    // still count as "recent" → day 5 becomes 'fresh' instead of 'ready'.
    const workouts = [
      mkStrengthWorkout("w1", isoAtLocal(2025, 2, 10), [{ primary: ["back"] }]),
    ];
    const baseline = computeRecoveryForecast(
      ["2025-03-15"],
      workouts,
      MUSCLES_UK,
      { nowMs: new Date(2025, 2, 15).getTime() },
    );
    const narrow = computeRecoveryForecast(
      ["2025-03-15"],
      workouts,
      MUSCLES_UK,
      { nowMs: new Date(2025, 2, 15).getTime(), freshThresholdDays: 3 },
    );

    // With default 7-day window, day 5 is still "recent" → ready.
    expect(baseline["2025-03-15"]?.status === "ready").toBeTruthy();
    // With 3-day window, back was trained 5 days ago → fresh.
    expect(narrow["2025-03-15"]?.status).toBe("fresh");
  });

  it("is stable across call order (ids sorted deterministically)", () => {
    const workouts = [
      mkStrengthWorkout("w1", isoAtLocal(2025, 2, 10), [
        { primary: ["legs_quads"] },
        { primary: ["legs_hams"] },
        { primary: ["back"] },
      ]),
    ];
    const out = computeRecoveryForecast(["2025-03-10"], workouts, MUSCLES_UK, {
      nowMs: new Date(2025, 2, 10, 22).getTime(),
    });
    const ids = out["2025-03-10"]?.overworkedMuscles.map((m) => m.id) ?? [];
    // daysSince ties at 0 → tie-break by id asc.
    expect(ids).toEqual(["back", "legs_hams", "legs_quads"]);
  });

  it("falls back to id when musclesUk label map is empty", () => {
    const workouts = [
      mkStrengthWorkout("w1", isoAtLocal(2025, 2, 10), [
        { primary: ["custom_muscle"] },
      ]),
    ];
    const out = computeRecoveryForecast(
      ["2025-03-10"],
      workouts,
      {},
      {
        nowMs: new Date(2025, 2, 10, 22).getTime(),
      },
    );
    expect(out["2025-03-10"]?.overworkedMuscles[0]?.label).toBe(
      "custom_muscle",
    );
  });

  it("skips malformed date keys without throwing", () => {
    const out = computeRecoveryForecast(
      ["not-a-date", "2025-13-40", "2025-03-10"],
      [],
      MUSCLES_UK,
      { nowMs: new Date(2025, 2, 10).getTime() },
    );
    expect(Object.keys(out)).toEqual(["2025-03-10"]);
  });

  it("ignores workouts with unparseable startedAt", () => {
    const workouts: Array<Partial<Workout>> = [
      {
        id: "bad",
        startedAt: "not an iso date",
        endedAt: null,
        items: [],
        groups: [],
        warmup: null,
        cooldown: null,
        note: "",
      },
    ];
    const out = computeRecoveryForecast(["2025-03-10"], workouts, MUSCLES_UK, {
      nowMs: new Date(2025, 2, 10).getTime(),
    });
    expect(out["2025-03-10"]?.status).toBe("fresh");
  });

  it("widens the red window when wellbeing is poor (low sleep / energy)", () => {
    // Same workout; with bad sleep the fatigue multiplier is >1 so
    // more muscles stay red on day-2.
    const workouts = [
      mkStrengthWorkout("w1", isoAtLocal(2025, 2, 10), [
        {
          primary: ["biceps"],
          sets: [
            { weightKg: 20, reps: 10 },
            { weightKg: 20, reps: 10 },
            { weightKg: 20, reps: 10 },
          ],
        },
      ]),
    ];
    const nowMs = new Date(2025, 2, 12, 20).getTime();

    const rested = computeRecoveryForecast(
      ["2025-03-12"],
      workouts,
      MUSCLES_UK,
      { nowMs, dailyLogEntries: [{ at: "2025-03-12", sleepHours: 9 }] },
    );
    const tired = computeRecoveryForecast(
      ["2025-03-12"],
      workouts,
      MUSCLES_UK,
      {
        nowMs,
        dailyLogEntries: [{ at: "2025-03-12", sleepHours: 4, energyLevel: 1 }],
      },
    );

    // Not asserting exact values — just that tired wellbeing never
    // produces a "better" (more ready) status than rested.
    const order: Record<DayRecoveryForecast["status"], number> = {
      fresh: 0,
      ready: 1,
      overworked: 2,
    };
    const restedStatus = rested["2025-03-12"]?.status ?? "fresh";
    const tiredStatus = tired["2025-03-12"]?.status ?? "fresh";
    expect(order[tiredStatus]).toBeGreaterThanOrEqual(order[restedStatus]);
  });
});

describe("describeDayRecovery", () => {
  it("returns a no-data string for null / undefined", () => {
    expect(describeDayRecovery(null)).toBe("Немає даних про відновлення");
    expect(describeDayRecovery(undefined)).toBe("Немає даних про відновлення");
  });

  it("reports 'fresh' with no muscle list", () => {
    const f: DayRecoveryForecast = {
      dateKey: "2025-03-10",
      status: "fresh",
      overworkedMuscles: [],
      recoveredMuscles: [],
      noRecentTraining: true,
    };
    expect(describeDayRecovery(f)).toContain("немає недавніх тренувань");
  });

  it("reports 'overworked' with up to 3 muscle names", () => {
    const f: DayRecoveryForecast = {
      dateKey: "2025-03-10",
      status: "overworked",
      overworkedMuscles: [
        { id: "chest", label: "Груди", status: "red", daysSince: 0 },
        { id: "triceps", label: "Трицепс", status: "red", daysSince: 0 },
        { id: "shoulders", label: "Дельти", status: "red", daysSince: 1 },
        { id: "back", label: "Спина", status: "red", daysSince: 1 },
      ],
      recoveredMuscles: [],
      noRecentTraining: false,
    };
    const txt = describeDayRecovery(f);
    expect(txt).toContain("перевантаження");
    expect(txt).toContain("Груди");
    expect(txt).toContain("Трицепс");
    expect(txt).toContain("Дельти");
    // 4th should be truncated.
    expect(txt).not.toContain("Спина");
  });

  it("reports 'ready' with muscle list", () => {
    const f: DayRecoveryForecast = {
      dateKey: "2025-03-10",
      status: "ready",
      overworkedMuscles: [],
      recoveredMuscles: [
        { id: "biceps", label: "Біцепс", status: "green", daysSince: 4 },
      ],
      noRecentTraining: false,
    };
    const txt = describeDayRecovery(f);
    expect(txt).toContain("готовий до тренування");
    expect(txt).toContain("Біцепс");
  });
});

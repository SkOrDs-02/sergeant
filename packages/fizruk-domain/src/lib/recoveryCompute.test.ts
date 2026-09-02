import { describe, it, expect } from "vitest";
import {
  loadPointsForItem,
  computeWellbeingMultiplier,
  computeWellbeingSignal,
  computeRecoveryBy,
  isFullyRecovered,
  WELLBEING_FRESH_WINDOW_HOURS,
} from "./recoveryCompute";

/**
 * Фікстури журналу самопочуття мають фіксовані дати, тож із появою вікна
 * свіжості (E-3) кожен виклик мусить передавати «зараз» поруч із ними —
 * інакше запис із 2026-01-01 просто випадає з вікна і множник = 1.0.
 */
const WB_NOW = Date.parse("2026-01-01T12:00:00Z");

describe("fizruk/recoveryCompute", () => {
  it("loadPointsForItem supports strength/time/distance", () => {
    expect(
      loadPointsForItem({
        type: "strength",
        sets: [{ weightKg: 100, reps: 10 }],
      }),
    ).toBeGreaterThan(0);
    expect(loadPointsForItem({ type: "time", durationSec: 240 })).toBeCloseTo(
      1,
    );
    expect(
      loadPointsForItem({
        type: "distance",
        distanceM: 5000,
        durationSec: 1800,
      }),
    ).toBeCloseTo(5 + 1);
  });

  it("computeWellbeingMultiplier clamps range", () => {
    const bad = computeWellbeingMultiplier(
      [{ at: "2026-01-01T08:00:00Z", sleepHours: 4, energyLevel: 1 }],
      WB_NOW,
    );
    expect(bad).toBeLessThanOrEqual(1.4);
    expect(bad).toBeGreaterThanOrEqual(0.7);
  });

  it("computeRecoveryBy marks recent muscle as red", () => {
    const nowMs = Date.parse("2026-01-10T12:00:00Z");
    const workouts = [
      {
        startedAt: "2026-01-10T10:00:00Z",
        items: [
          {
            type: "strength",
            sets: [{ weightKg: 60, reps: 10 }],
            musclesPrimary: ["chest"],
          },
        ],
      },
    ];
    const by = computeRecoveryBy(
      workouts as never,
      { chest: "Груди" },
      nowMs,
      [],
    );
    expect(by["chest"]!.status).toBe("red");
    expect(isFullyRecovered(by["chest"])).toBe(false);
  });

  it("daysSince counts Kyiv calendar days, not elapsed 24h windows", () => {
    // Workout 23:30 Kyiv on the 14th; evaluated 09:00 Kyiv on the 15th.
    // Only 9.5h elapsed, but it must read as "1 день тому".
    const nowMs = Date.UTC(2026, 0, 15, 7, 0); // Kyiv 09:00
    const workouts = [
      {
        startedAt: new Date(Date.UTC(2026, 0, 14, 21, 30)).toISOString(),
        items: [
          {
            type: "strength",
            sets: [{ weightKg: 60, reps: 10 }],
            musclesPrimary: ["chest"],
          },
        ],
      },
    ];
    const by = computeRecoveryBy(
      workouts as never,
      { chest: "Груди" },
      nowMs,
      [],
    );
    expect(by["chest"]!.daysSince).toBe(1);
  });

  it("daysSince is 0 within the same Kyiv day", () => {
    const nowMs = Date.UTC(2026, 0, 15, 20, 0); // Kyiv 22:00
    const workouts = [
      {
        startedAt: new Date(Date.UTC(2026, 0, 15, 5, 0)).toISOString(), // Kyiv 07:00
        items: [
          {
            type: "strength",
            sets: [{ weightKg: 60, reps: 10 }],
            musclesPrimary: ["chest"],
          },
        ],
      },
    ];
    const by = computeRecoveryBy(
      workouts as never,
      { chest: "Груди" },
      nowMs,
      [],
    );
    expect(by["chest"]!.daysSince).toBe(0);
  });

  it("load14d includes workouts 8-14 days old that load7d excludes", () => {
    const nowMs = Date.parse("2026-01-15T12:00:00Z");
    // 10 days before `now` — inside the 14-day window, outside the 7-day one.
    const workouts = [
      {
        startedAt: "2026-01-05T10:00:00Z",
        items: [
          {
            type: "strength",
            sets: [{ weightKg: 60, reps: 10 }],
            musclesPrimary: ["chest"],
          },
        ],
      },
    ];
    const by = computeRecoveryBy(
      workouts as never,
      { chest: "Груди" },
      nowMs,
      [],
    );
    expect(by["chest"]!.load7d).toBe(0);
    expect(by["chest"]!.load14d).toBeGreaterThan(0);
  });

  it("load14d excludes workouts older than 14 days", () => {
    const nowMs = Date.parse("2026-01-15T12:00:00Z");
    // 20 days before `now` — outside both the 7- and 14-day windows.
    const workouts = [
      {
        startedAt: "2025-12-26T10:00:00Z",
        items: [
          {
            type: "strength",
            sets: [{ weightKg: 60, reps: 10 }],
            musclesPrimary: ["chest"],
          },
        ],
      },
    ];
    const by = computeRecoveryBy(
      workouts as never,
      { chest: "Груди" },
      nowMs,
      [],
    );
    expect(by["chest"]!.load7d).toBe(0);
    expect(by["chest"]!.load14d).toBe(0);
  });

  it("loadPointsForItem handles empty and degenerate sets", () => {
    expect(loadPointsForItem(null)).toBe(0);
    expect(loadPointsForItem(undefined)).toBe(0);
    expect(loadPointsForItem({ type: "strength" })).toBe(0);
    expect(loadPointsForItem({ type: "strength", sets: [] })).toBe(0);
    // Zero-load set contributes no tonnage and is not counted as a set.
    expect(
      loadPointsForItem({ type: "strength", sets: [{ weightKg: 0, reps: 0 }] }),
    ).toBe(0);
    // Bodyweight set (reps only) still counts as a set.
    expect(
      loadPointsForItem({
        type: "strength",
        sets: [{ weightKg: 0, reps: 12 }],
      }),
    ).toBeCloseTo(0.15);
    // Non-finite inputs coerce to 0 instead of propagating NaN.
    expect(
      loadPointsForItem({
        type: "strength",
        sets: [{ weightKg: Number.NaN, reps: 10 }],
      }),
    ).toBeCloseTo(0.15);
  });

  it("loadPointsForItem returns 0 for an unrecognized item type", () => {
    expect(loadPointsForItem({ type: "meditation" } as never)).toBe(0);
  });

  describe("computeWellbeingMultiplier", () => {
    it("returns 1.0 when there is no daily log data", () => {
      expect(computeWellbeingMultiplier([])).toBe(1.0);
      expect(computeWellbeingMultiplier()).toBe(1.0);
    });

    it("ignores entries with neither sleep nor energy data", () => {
      expect(computeWellbeingMultiplier([{ at: "2026-01-01" }], WB_NOW)).toBe(
        1.0,
      );
    });

    it("picks the most recent entry with sleep data (sorted desc by `at`)", () => {
      const m = computeWellbeingMultiplier(
        [
          { at: "2026-01-04T08:00:00Z", sleepHours: 4 }, // older, poor sleep
          { at: "2026-01-05T08:00:00Z", sleepHours: 9 }, // newest, great sleep
        ],
        Date.parse("2026-01-05T12:00:00Z"),
      );
      // newest entry (9h, >=8) applies -0.1, no energy data -> 0.9
      expect(m).toBeCloseTo(0.9);
    });

    it.each([
      [4, 1.3], // <5 -> +0.3
      [5, 1.2], // 5..<6 -> +0.2
      [6, 1.1], // 6..<7 -> +0.1
      [7, 1.0], // 7..<8 -> no change
      [8, 0.9], // >=8 -> -0.1
    ])("sleepHours=%s yields multiplier %s", (sleepHours, expected) => {
      expect(
        computeWellbeingMultiplier(
          [{ at: "2026-01-01T08:00:00Z", sleepHours }],
          WB_NOW,
        ),
      ).toBeCloseTo(expected);
    });

    it.each([
      [1, 1.3], // <=1 -> +0.3
      [2, 1.2], // <=2 -> +0.2
      [2.5, 1.15], // <=2.5 -> +0.15
      [3, 1.0], // between 2.5 and 4 -> no change
      [4, 0.9], // >=4 -> -0.1
      [4.5, 0.85], // >=4.5 -> -0.15
    ])("energyLevel=%s yields multiplier %s", (energyLevel, expected) => {
      expect(
        computeWellbeingMultiplier(
          [{ at: "2026-01-01T08:00:00Z", energyLevel }],
          WB_NOW,
        ),
      ).toBeCloseTo(expected);
    });

    it("combines sleep and energy penalties, clamped to [0.7, 1.4]", () => {
      const m = computeWellbeingMultiplier(
        [{ at: "2026-01-01T08:00:00Z", sleepHours: 3, energyLevel: 1 }],
        WB_NOW,
      );
      // +0.3 (sleep) + 0.3 (energy) = 1.6, clamped to 1.4
      expect(m).toBe(1.4);
    });
  });
  describe("вікно свіжості самопочуття (E-3)", () => {
    const HOUR = 60 * 60 * 1000;
    const now = Date.parse("2026-03-10T12:00:00Z");
    const at = (hoursAgo: number) =>
      new Date(now - hoursAgo * HOUR).toISOString();

    it("запис поза вікном не прискорює відновлення", () => {
      const entries = [{ at: at(24 * 30), sleepHours: 9 }];
      // Місячної давності «чудовий сон» раніше НАЗАВЖДИ давав 0.9 —
      // саме це і був розрив E-3.
      expect(computeWellbeingMultiplier(entries, now)).toBe(1.0);
      const signal = computeWellbeingSignal(entries, now);
      expect(signal.usedSleep).toBe(false);
      expect(signal.stale).toBe(true);
      expect(signal.sleepAgeHours).toBeCloseTo(720, 0);
    });

    it("запис усередині вікна діє як раніше", () => {
      const entries = [{ at: at(12), sleepHours: 9 }];
      expect(computeWellbeingMultiplier(entries, now)).toBeCloseTo(0.9);
      const signal = computeWellbeingSignal(entries, now);
      expect(signal.usedSleep).toBe(true);
      expect(signal.stale).toBe(false);
    });

    it("рівно на межі вікна запис ще діє", () => {
      const entries = [{ at: at(WELLBEING_FRESH_WINDOW_HOURS), sleepHours: 4 }];
      expect(computeWellbeingMultiplier(entries, now)).toBeCloseTo(1.3);
    });

    it("сон і енергія старіють НЕЗАЛЕЖНО", () => {
      const signal = computeWellbeingSignal(
        [
          { at: at(24 * 10), sleepHours: 4 }, // поза вікном
          { at: at(6), energyLevel: 1 }, // у вікні
        ],
        now,
      );
      expect(signal.usedSleep).toBe(false);
      expect(signal.usedEnergy).toBe(true);
      // Лише енергія: 1.0 + 0.3.
      expect(signal.multiplier).toBeCloseTo(1.3);
      // Один із двох входів живий — це не «журнал застарів».
      expect(signal.stale).toBe(false);
    });

    it("запис без придатної дати множник не рухає", () => {
      const signal = computeWellbeingSignal(
        [{ at: "не-дата", sleepHours: 4 }],
        now,
      );
      expect(signal.multiplier).toBe(1.0);
      expect(signal.sleepAgeHours).toBeNull();
      expect(signal.stale).toBe(true);
    });

    it("порожній журнал — це не «застарів»", () => {
      expect(computeWellbeingSignal([], now).stale).toBe(false);
    });

    it("computeRecoveryBy передає своє `now` у вікно свіжості", () => {
      const workouts = [
        {
          startedAt: new Date(now - 2 * 24 * HOUR).toISOString(),
          items: [
            {
              type: "strength" as const,
              sets: [{ weightKg: 100, reps: 10 }],
              musclesPrimary: ["chest"],
            },
          ],
        },
      ];
      const fresh = computeRecoveryBy(workouts as never, {}, now, [
        { at: at(12), sleepHours: 9 },
      ]);
      const stale = computeRecoveryBy(workouts as never, {}, now, [
        { at: at(24 * 30), sleepHours: 9 },
      ]);
      // Свіжий «чудовий сон» знижує втому; протухлий — уже ні.
      expect(fresh["chest"]!.fatigue).toBeLessThan(stale["chest"]!.fatigue);
    });
  });
});

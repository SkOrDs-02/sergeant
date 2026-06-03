import { describe, it, expect } from "vitest";
import {
  buildStrengthProgressData,
  startOfLocalIsoWeek,
} from "../exerciseProgress";

/**
 * Module unit suite — fizruk strength-progress aggregation.
 *
 * Audit `2026-05-13-testing-devx-roast.md` §P1-6 ("Web coverage drift"):
 * the fizruk UI slices stayed thin. `buildStrengthProgressData` is the pure
 * transform behind the exercise progress chart — weekly bucketing, Epley
 * 1RM max, volume sum, and the trailing-12-weeks window — all deterministic
 * from in-memory workout history.
 */

// `ExerciseHistoryEntry` is internal to the module; build minimal structural
// objects and cast at the call boundary.
function entry(
  startedAt: string,
  sets: Array<{ weightKg: number; reps: number }>,
) {
  return {
    workout: { startedAt },
    item: {
      id: "i1",
      exerciseId: "bench",
      nameUk: "Жим лежачи",
      primaryGroup: "chest",
      musclesPrimary: [],
      musclesSecondary: [],
      type: "strength" as const,
      sets,
    },
  };
}

describe("startOfLocalIsoWeek", () => {
  it("snaps any weekday back to Monday at local midnight", () => {
    // 2026-06-03 is a Wednesday → Monday is 2026-06-01.
    const monday = startOfLocalIsoWeek(new Date(2026, 5, 3, 14, 30));
    expect(monday.getDay()).toBe(1); // Monday
    expect(monday.getDate()).toBe(1);
    expect(monday.getHours()).toBe(0);
    expect(monday.getMinutes()).toBe(0);
  });

  it("treats Sunday as the end of the prior ISO week", () => {
    // 2026-06-07 is a Sunday → ISO week starts Monday 2026-06-01.
    const monday = startOfLocalIsoWeek(new Date(2026, 5, 7, 9));
    expect(monday.getDate()).toBe(1);
  });
});

describe("buildStrengthProgressData", () => {
  it("computes per-week max 1RM and summed volume", () => {
    const history = [
      // Two sessions in the same ISO week (Mon 2026-06-01 / Wed 2026-06-03).
      entry("2026-06-01T10:00:00", [{ weightKg: 100, reps: 5 }]),
      entry("2026-06-03T10:00:00", [{ weightKg: 80, reps: 10 }]),
    ].map((e) => e as Parameters<typeof buildStrengthProgressData>[0][number]);

    const { rmPoints, volPoints } = buildStrengthProgressData(history);

    // Single week bucket → one point each.
    expect(rmPoints).toHaveLength(1);
    expect(volPoints).toHaveLength(1);
    // max 1RM = max(epley(100,5)=116.67, epley(80,10)=106.67) → round 117.
    expect(rmPoints[0]?.value).toBe(117);
    // volume = 100*5 + 80*10 = 1300.
    expect(volPoints[0]?.value).toBe(1300);
  });

  it("ignores non-strength items and workouts without startedAt", () => {
    const distance = {
      workout: { startedAt: "2026-06-01T10:00:00" },
      item: { type: "distance", sets: [] },
    } as unknown as Parameters<typeof buildStrengthProgressData>[0][number];

    const { rmPoints } = buildStrengthProgressData([distance]);
    expect(rmPoints).toHaveLength(0);
  });

  it("keeps only the trailing 12 week buckets", () => {
    // 20 distinct weeks, each one set.
    const history = Array.from({ length: 20 }, (_, i) => {
      const monday = new Date(2026, 0, 5 + i * 7, 10); // Mondays, 7 days apart
      return entry(monday.toISOString(), [{ weightKg: 50 + i, reps: 5 }]);
    }).map((e) => e as Parameters<typeof buildStrengthProgressData>[0][number]);

    const { rmPoints } = buildStrengthProgressData(history);
    expect(rmPoints).toHaveLength(12);
  });

  it("returns empty arrays for empty history", () => {
    expect(buildStrengthProgressData([])).toEqual({
      rmPoints: [],
      volPoints: [],
    });
  });
});

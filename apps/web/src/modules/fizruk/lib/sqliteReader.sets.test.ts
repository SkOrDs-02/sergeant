import { describe, expect, it } from "vitest";

import { rowToWorkoutSet, WORKOUT_SETS_SELECT_SQL } from "./sqliteReader.sets";

const base = {
  id: "s1",
  workout_item_id: "i1",
  weight_kg: 0,
  reps: 0,
  rpe: null,
  sort_order: 0,
};

describe("rowToWorkoutSet — секунди й метри підходу (міграція 172 / 010)", () => {
  it("читає секунди й метри, коли вони є", () => {
    expect(
      rowToWorkoutSet({ ...base, duration_sec: 30, distance_m: 400 }),
    ).toEqual({ weightKg: 0, reps: 0, durationSec: 30, distanceM: 400 });
  });

  it("рядок до фічі (NULL чи без колонок) дає старий підхід", () => {
    expect(
      rowToWorkoutSet({ ...base, weight_kg: 60, reps: 8, rpe: 8 }),
    ).toEqual({
      weightKg: 60,
      reps: 8,
      rpe: 8,
    });
    expect(
      rowToWorkoutSet({ ...base, duration_sec: null, distance_m: null }),
    ).toEqual({ weightKg: 0, reps: 0 });
  });

  it("SELECT несе обидві нові колонки", () => {
    expect(WORKOUT_SETS_SELECT_SQL).toContain("duration_sec, distance_m");
  });
});

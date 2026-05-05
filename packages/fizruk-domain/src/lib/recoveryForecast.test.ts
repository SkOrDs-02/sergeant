import { describe, expect, it } from "vitest";
import { forecastFullRecoveryByDate } from "./recoveryForecast";

describe("forecastFullRecoveryByDate", () => {
  it("повертає дату для м'яза після навантаження", () => {
    const musclesUk = { biceps: "Біцепс" };
    const workouts = [
      {
        startedAt: new Date().toISOString(),
        items: [
          {
            type: "strength",
            musclesPrimary: ["biceps"],
            musclesSecondary: [],
            sets: [{ weightKg: 20, reps: 10 }],
          },
        ],
      },
    ];
    const out = forecastFullRecoveryByDate(workouts as never, musclesUk);
    expect(out["biceps"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

import { describe, expect, it } from "vitest";

import { getExerciseMeasureRecord } from "./measureRecords.js";
import {
  itemTonnageKg,
  personalRecordsExerciseCount,
} from "../../lib/workoutStats.js";

const plankWorkout = (date: string, secs: number[]) => ({
  startedAt: date,
  items: [
    {
      exerciseId: "plank",
      type: "time",
      measure: "time",
      sets: secs.map((s) => ({ weightKg: 0, reps: 0, durationSec: s })),
    },
  ],
});

describe("рекорди за типом виміру", () => {
  it("на час — найдовший одиночний підхід", () => {
    const rec = getExerciseMeasureRecord(
      [
        plankWorkout("2026-11-01", [30, 45, 40]),
        plankWorkout("2026-11-08", [60]),
      ],
      "plank",
    );
    expect(rec).toEqual({
      measure: "time",
      dimension: "time",
      best: 60,
      weightKg: 0,
      date: "2026-11-08",
    });
  });

  it("на дистанцію — найдовша дистанція підходу, вага як контекст", () => {
    const rec = getExerciseMeasureRecord(
      [
        {
          startedAt: "2026-11-02",
          items: [
            {
              exerciseId: "sled_push",
              type: "distance",
              measure: "weight_distance",
              sets: [
                { weightKg: 80, reps: 0, distanceM: 20 },
                { weightKg: 60, reps: 0, distanceM: 30 },
              ],
            },
          ],
        },
      ],
      "sled_push",
    );
    expect(rec?.best).toBe(30);
    expect(rec?.weightKg).toBe(60);
  });

  it("для повторів і без зарахованих підходів рекорду за цим правилом немає", () => {
    expect(
      getExerciseMeasureRecord(
        [
          {
            items: [
              {
                exerciseId: "x",
                type: "strength",
                sets: [{ weightKg: 50, reps: 5 }],
              },
            ],
          },
        ],
        "x",
      ),
    ).toBeNull();
    expect(
      getExerciseMeasureRecord([plankWorkout("d", [0])], "plank"),
    ).toBeNull();
  });

  it("лічильник вправ із рекордом рахує й утримання; тоннаж — лише вага × повтори", () => {
    expect(personalRecordsExerciseCount([plankWorkout("d", [30])])).toBe(1);
    expect(
      itemTonnageKg({
        type: "strength",
        measure: "reps",
        sets: [{ weightKg: 0, reps: 10 }],
      }),
    ).toBe(0);
    expect(
      itemTonnageKg({
        type: "time",
        measure: "weight_time",
        sets: [{ weightKg: 24, reps: 0, durationSec: 40 }],
      }),
    ).toBe(0);
    expect(
      itemTonnageKg({ type: "strength", sets: [{ weightKg: 10, reps: 10 }] }),
    ).toBe(100);
  });
});

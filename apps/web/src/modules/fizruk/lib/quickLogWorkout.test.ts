/**
 * Last validated: 2026-09-15
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import { classifyWorkoutWeight } from "@sergeant/fizruk-domain";

import {
  QUICK_LOG_EXERCISE_IDS,
  QUICK_LOG_EXERCISE_LABELS_UK,
  buildQuickLogWorkout,
  estimateQuickLogDurationSec,
} from "./quickLogWorkout";

const ENDED = "2026-09-15T18:00:00.000Z";

describe("estimateQuickLogDurationSec", () => {
  it("~2 с на повторення, у межах 30 с … 10 хв", () => {
    expect(estimateQuickLogDurationSec(1)).toBe(30);
    expect(estimateQuickLogDurationSec(20)).toBe(40);
    expect(estimateQuickLogDurationSec(100)).toBe(200);
    expect(estimateQuickLogDurationSec(1000)).toBe(600);
  });
});

describe("buildQuickLogWorkout", () => {
  it("«+20 відтискань» — завершений Workout з одним підходом без ваги", () => {
    const w = buildQuickLogWorkout({
      exerciseId: "pushup",
      reps: 20,
      endedAt: ENDED,
      kcalBurned: 7,
    });
    expect(w).not.toBeNull();
    expect(w?.endedAt).toBe(ENDED);
    // 20 повторень → 40 с тривалості, початок виведено назад.
    expect(w?.startedAt).toBe("2026-09-15T17:59:20.000Z");
    expect(w?.items).toHaveLength(1);
    expect(w?.items[0]).toMatchObject({
      exerciseId: "pushup",
      nameUk: "Віджимання від підлоги",
      primaryGroup: "chest",
      type: "strength",
      sets: [{ weightKg: 0, reps: 20 }],
      met: 5,
    });
    // Мʼязи — доменні ключі з каталогу, а не назва групи: саме їх читає
    // модель відновлення і силует «Моє тіло».
    expect(w?.items[0]?.musclesPrimary).toEqual([
      "pectoralis_major",
      "triceps",
    ]);
    expect(w?.kcalBurned).toBe(7);
  });

  it("є легким для стріку (канон §8) — один підхід за пів хвилини", () => {
    const w = buildQuickLogWorkout({
      exerciseId: "pushup",
      reps: 20,
      endedAt: ENDED,
    });
    expect(classifyWorkoutWeight(w)).toBe("light");
    // І навіть стеля повторень не перетинає поріг «повноцінного» за часом.
    const max = buildQuickLogWorkout({
      exerciseId: "pushup",
      reps: 1000,
      endedAt: ENDED,
    });
    expect(classifyWorkoutWeight(max)).toBe("light");
  });

  it("власний id — для детермінованої міграції, item успадковує його", () => {
    const w = buildQuickLogWorkout({
      exerciseId: "pushup",
      reps: 25,
      endedAt: ENDED,
      id: "pushups:2026-09-10",
      note: "з лічильника",
    });
    expect(w?.id).toBe("pushups:2026-09-10");
    expect(w?.items[0]?.id).toBe("pushups:2026-09-10_i1");
    expect(w?.note).toBe("з лічильника");
  });

  it("нуль повторень, понад стелю, невідома вправа чи бита дата → null", () => {
    expect(
      buildQuickLogWorkout({ exerciseId: "pushup", reps: 0, endedAt: ENDED }),
    ).toBeNull();
    expect(
      buildQuickLogWorkout({
        exerciseId: "pushup",
        reps: 1001,
        endedAt: ENDED,
      }),
    ).toBeNull();
    expect(
      buildQuickLogWorkout({ exerciseId: "nope", reps: 10, endedAt: ENDED }),
    ).toBeNull();
    expect(
      buildQuickLogWorkout({
        exerciseId: "pushup",
        reps: 10,
        endedAt: "не дата",
      }),
    ).toBeNull();
  });

  it("kcal не пишеться, коли оцінки немає", () => {
    const w = buildQuickLogWorkout({
      exerciseId: "pushup",
      reps: 10,
      endedAt: ENDED,
      kcalBurned: null,
    });
    expect(w).not.toBeNull();
    expect("kcalBurned" in (w ?? {})).toBe(false);
  });

  it("кожна вправа чіпів існує в каталозі, має підпис і власну вагу", () => {
    for (const id of QUICK_LOG_EXERCISE_IDS) {
      const w = buildQuickLogWorkout({
        exerciseId: id,
        reps: 10,
        endedAt: ENDED,
      });
      expect(w, id).not.toBeNull();
      expect(QUICK_LOG_EXERCISE_LABELS_UK[id].length).toBeGreaterThan(0);
    }
  });
});

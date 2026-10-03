import { describe, expect, it } from "vitest";
import { computeKcalBurned, computeWorkoutKcalBurned } from "./kcalBurned";
import { loadPointsForItem } from "./recoveryCompute";

describe("computeKcalBurned", () => {
  it("масштабується вагою: MET 6 × 45 хв дає 270 ккал на 60 кг і 405 на 90", () => {
    const base = { met: 6, durationSec: 45 * 60 } as const;
    expect(computeKcalBurned({ ...base, weightKg: 60 })).toBe(270);
    expect(computeKcalBurned({ ...base, weightKg: 90 })).toBe(405);
  });

  it("«важко» піднімає результат рівно на 25%", () => {
    const base = { met: 6, weightKg: 60, durationSec: 45 * 60 } as const;
    const normal = computeKcalBurned({ ...base, intensity: "normal" });
    const hard = computeKcalBurned({ ...base, intensity: "hard" });
    expect(normal).toBe(270);
    expect(hard).toBe(Math.round(270 * 1.25));
  });

  it("без ваги повертає null, а не нуль", () => {
    expect(
      computeKcalBurned({ met: 6, weightKg: null, durationSec: 2700 }),
    ).toBeNull();
    expect(
      computeKcalBurned({ met: 6, weightKg: 0, durationSec: 2700 }),
    ).toBeNull();
    expect(
      computeKcalBurned({ met: 0, weightKg: 60, durationSec: 2700 }),
    ).toBeNull();
  });
});

describe("computeWorkoutKcalBurned", () => {
  it("віддає збережене число простого запису без перерахунку", () => {
    expect(computeWorkoutKcalBurned({ kcalBurned: 270, items: [] }, 90)).toBe(
      270,
    );
  });

  it("бере MET із каталогу занять, коли поле item-а не дожило до читання", () => {
    // Після перезавантаження в рядку лишаються лише колонки таблиці:
    // `exerciseId` і `durationSec`. Оцінка має вижити саме на них.
    const kcal = computeWorkoutKcalBurned(
      {
        startedAt: "2026-09-01T10:00:00.000Z",
        endedAt: "2026-09-01T10:45:00.000Z",
        items: [
          {
            type: "time",
            exerciseId: "activity:body_pump",
            durationSec: 2700,
          },
        ],
      },
      60,
    );
    expect(kcal).toBe(270);
  });

  it("не рахує інтенсивність двічі: множник живе лише в durationSec", () => {
    const kcal = computeWorkoutKcalBurned(
      {
        startedAt: "2026-09-01T10:00:00.000Z",
        endedAt: "2026-09-01T10:45:00.000Z",
        items: [
          {
            type: "time",
            exerciseId: "activity:body_pump",
            intensity: "hard",
            durationSec: 2700 * 1.25,
          },
        ],
      },
      60,
    );
    expect(kcal).toBe(Math.round(270 * 1.25));
  });

  it("розкладає тривалість сесії по силових items пропорційно підходам", () => {
    const kcal = computeWorkoutKcalBurned(
      {
        startedAt: "2026-09-01T10:00:00.000Z",
        endedAt: "2026-09-01T11:00:00.000Z",
        items: [
          { type: "strength", met: 6, sets: [{ weightKg: 60, reps: 10 }] },
          {
            type: "strength",
            met: 6,
            sets: [
              { weightKg: 60, reps: 10 },
              { weightKg: 60, reps: 10 },
              { weightKg: 60, reps: 10 },
            ],
          },
        ],
      },
      80,
    );
    // Година, MET 6, 80 кг = 480 ккал на всю сесію, поділені 1:3.
    expect(kcal).toBe(480);
  });

  it("без ваги оцінити нічим", () => {
    expect(
      computeWorkoutKcalBurned(
        {
          startedAt: "2026-09-01T10:00:00.000Z",
          endedAt: "2026-09-01T11:00:00.000Z",
          items: [{ type: "time", met: 6, durationSec: 3600 }],
        },
        null,
      ),
    ).toBeNull();
  });
});

describe("простий запис годує модель відновлення", () => {
  it("item типу time на 45 хв дає 11.25 бала без змін у формулі", () => {
    expect(loadPointsForItem({ type: "time", durationSec: 2700 })).toBe(11.25);
  });
});

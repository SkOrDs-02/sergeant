import { describe, expect, it } from "vitest";

import { epley1rm, suggestNextSet } from "../../lib/workoutStats.js";
import { computeNextSetAging } from "./nextSetAging.js";

const NOW = new Date("2026-08-02T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * DAY).toISOString();
}

// Штанга на ноги: діапазон 5-8, крок 5 кг.
const SQUAT = { equipment: ["barbell"], primaryGroup: "quadriceps" };

describe("computeNextSetAging — підказка наступного підходу (logic-04)", () => {
  // Пік 120×5 (e1RM 140) 125 днів тому, пауза 4 міс, учора — легка сесія 60×8.
  const lastSet = { weightKg: 60, reps: 8 };
  const sessions = [
    { at: daysAgo(125), best1rm: epley1rm(120, 5) },
    { at: daysAgo(1), best1rm: epley1rm(60, 8) },
  ];

  it("пауза 4 міс → одне легке заняття: режим повернення тримається, вага не росте", () => {
    const aging = computeNextSetAging({
      lastBest1rm: epley1rm(60, 8),
      lastSessionAt: daysAgo(1),
      sessions,
      now: NOW,
    });
    expect(aging.returnMode).toBe(true);
    expect(aging.returnReason).toBe("layoff");
    // Орієнтир 105 вищий за останні 76: другий раз не знижуємо.
    expect(aging.reductionPct).toBe(0);

    const s = suggestNextSet(lastSet, { exercise: SQUAT, aging });
    expect(s?.softMode).toBe(true);
    expect(s?.weightKg).toBe(60);
    expect(s?.reps).toBe(5);
  });

  it("без сесій — як раніше: остання сесія свіжа, подвійна прогресія вмикається", () => {
    const aging = computeNextSetAging({
      lastBest1rm: epley1rm(60, 8),
      lastSessionAt: daysAgo(1),
      now: NOW,
    });
    expect(aging.returnMode).toBe(false);
    const s = suggestNextSet(lastSet, { exercise: SQUAT, aging });
    // 8 повторів = стеля діапазону → +5 кг. Саме це підвищення й було дефектом.
    expect(s?.softMode).toBe(false);
    expect(s?.weightKg).toBe(65);
  });

  it("повернення завершене (≥90% зниженого піка) → звичайна прогресія", () => {
    const aging = computeNextSetAging({
      lastBest1rm: epley1rm(100, 5),
      lastSessionAt: daysAgo(1),
      sessions: [
        { at: daysAgo(125), best1rm: epley1rm(120, 5) },
        { at: daysAgo(1), best1rm: epley1rm(100, 5) },
      ],
      now: NOW,
    });
    // 116.7 ≥ 0.9 × 105 → вихід із режиму.
    expect(aging.returnMode).toBe(false);
    expect(aging.reductionPct).toBe(0);
  });

  it("триває пауза: береться суворіше зниження — від останньої сесії, а не від піка", () => {
    // Пік 140 рік тому, остання сесія 85×5 (e1RM ≈ 99) 5 міс тому.
    const lastBest1rm = epley1rm(85, 5);
    const aging = computeNextSetAging({
      lastBest1rm,
      lastSessionAt: daysAgo(150),
      sessions: [
        { at: daysAgo(365), best1rm: epley1rm(120, 5) },
        { at: daysAgo(150), best1rm: lastBest1rm },
      ],
      now: NOW,
    });
    expect(aging.returnMode).toBe(true);
    // Від останньої сесії: 150 днів → підлога 0.75 → −25%. Від піка 140×0.75 = 105
    // це було б 0% (105 > 99) — і людина після 5 міс отримала б ту саму вагу.
    expect(aging.reductionPct).toBe(25);
  });

  it("свіжа історія без пауз — режиму немає", () => {
    const aging = computeNextSetAging({
      lastBest1rm: epley1rm(100, 5),
      lastSessionAt: daysAgo(3),
      sessions: [
        { at: daysAgo(10), best1rm: epley1rm(100, 5) },
        { at: daysAgo(3), best1rm: epley1rm(100, 5) },
      ],
      now: NOW,
    });
    expect(aging).toEqual({
      returnMode: false,
      returnReason: null,
      reductionPct: 0,
    });
  });
});

describe("computeNextSetAging — зняття позначки травми (E-5, аудит 2026-11-17)", () => {
  // Свіжа історія без пауз: режим повернення може ввімкнути лише травма.
  const lastSet = { weightKg: 100, reps: 8 };
  const sessions = [
    { at: daysAgo(8), best1rm: epley1rm(100, 7) },
    { at: daysAgo(2), best1rm: epley1rm(100, 8) },
  ];

  it("позначку знято 5 днів тому → мʼякий режим «injury», вага не росте", () => {
    const aging = computeNextSetAging({
      lastBest1rm: epley1rm(100, 8),
      lastSessionAt: daysAgo(2),
      sessions,
      injuryClearedAt: daysAgo(5),
      now: NOW,
    });
    expect(aging.returnMode).toBe(true);
    expect(aging.returnReason).toBe("injury");
    expect(aging.reductionPct).toBe(10);

    const s = suggestNextSet(lastSet, { exercise: SQUAT, aging });
    expect(s?.softMode).toBe(true);
    expect(s?.weightKg).toBeLessThan(100);
  });

  it("позначку знято понад 21 день тому → звичайна прогресія", () => {
    const aging = computeNextSetAging({
      lastBest1rm: epley1rm(100, 8),
      lastSessionAt: daysAgo(2),
      sessions,
      injuryClearedAt: daysAgo(30),
      now: NOW,
    });
    expect(aging.returnMode).toBe(false);
    expect(aging.returnReason).toBeNull();
  });
});

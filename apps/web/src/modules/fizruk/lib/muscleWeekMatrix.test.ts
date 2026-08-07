/**
 * Status: Active
 *
 * Що тут охороняється — саме те, заради чого вид існує: щоб матриця
 * доїжджала до екрана цілою, а не згорталась назад у один тиждень.
 */
import { describe, expect, it } from "vitest";
import { kyivMondayStartMs } from "@sergeant/shared";
import {
  MATRIX_WEEKS,
  MIN_WEEKS_WITH_DATA,
  buildMuscleWeekMatrix,
} from "./muscleWeekMatrix";

const DAY = 24 * 60 * 60 * 1000;
/** Середа, щоб «понеділок тижня» не збігався з самою датою. */
const NOW = Date.parse("2026-08-05T12:00:00.000Z");

function strengthWorkout(atMs: number, muscle: string, kg: number) {
  return {
    startedAt: new Date(atMs).toISOString(),
    items: [
      {
        type: "strength",
        musclesPrimary: [muscle],
        sets: [{ weightKg: kg, reps: 10 }],
      },
    ],
  };
}

describe("buildMuscleWeekMatrix", () => {
  it("тримає всі чотири тижні, а не лише останній", () => {
    const m = buildMuscleWeekMatrix(
      [
        strengthWorkout(NOW, "chest", 100),
        strengthWorkout(NOW - 7 * DAY, "chest", 50),
        strengthWorkout(NOW - 21 * DAY, "chest", 200),
      ],
      { chest: "Груди" },
      NOW,
    );

    expect(m.weekStarts).toHaveLength(MATRIX_WEEKS);
    const chest = m.rows.find((r) => r.id === "chest");
    expect(chest?.weekly).toHaveLength(MATRIX_WEEKS);
    // Найстаріший → найновіший: 21 днів тому, порожньо, тиждень тому, зараз.
    expect(chest?.weekly.map((v) => Number(v.toFixed(2)))).toEqual([
      2, 0, 0.5, 1,
    ]);
    expect(chest?.latest).toBeCloseTo(1);
  });

  it("тиждень без тренувань лишається НУЛЕМ, а не зникає", () => {
    const m = buildMuscleWeekMatrix(
      [strengthWorkout(NOW, "chest", 100)],
      null,
      NOW,
    );
    const chest = m.rows.find((r) => r.id === "chest");
    // Три порожні тижні мусять бути присутні як нулі — саме на різниці
    // «нуль проти пропуску» вже спіткнулись крос-модульні звʼязки.
    expect(chest?.weekly.slice(0, 3)).toEqual([0, 0, 0]);
  });

  it("ранжує рядки за сумою вікна, а не за останнім тижнем", () => {
    const m = buildMuscleWeekMatrix(
      [
        // Спина: багато три тижні тому, нічого зараз.
        strengthWorkout(NOW - 21 * DAY, "back", 400),
        // Груди: трохи, зате цього тижня.
        strengthWorkout(NOW, "chest", 50),
      ],
      null,
      NOW,
    );
    expect(m.rows[0]?.id).toBe("back");
  });

  it("нормалізує по ВСІЙ матриці, тож рядки лишаються порівнюваними", () => {
    const m = buildMuscleWeekMatrix(
      [strengthWorkout(NOW, "back", 400), strengthWorkout(NOW, "chest", 50)],
      null,
      NOW,
    );
    // Один спільний максимум: якби нормалізували по рядку, «груди» мали б
    // повний стовпчик і виглядали б як «спина».
    expect(m.max).toBeCloseTo(4);
  });

  it("рахує тижні з даними для порога мовчання", () => {
    const one = buildMuscleWeekMatrix(
      [strengthWorkout(NOW, "chest", 100)],
      null,
      NOW,
    );
    expect(one.weeksWithData).toBe(1);
    expect(one.weeksWithData).toBeLessThan(MIN_WEEKS_WITH_DATA);

    const two = buildMuscleWeekMatrix(
      [
        strengthWorkout(NOW, "chest", 100),
        strengthWorkout(NOW - 7 * DAY, "chest", 100),
      ],
      null,
      NOW,
    );
    expect(two.weeksWithData).toBe(MIN_WEEKS_WITH_DATA);
  });

  it("вікно вирівняне по київських понеділках", () => {
    const m = buildMuscleWeekMatrix([], null, NOW);
    expect(m.weekStarts[MATRIX_WEEKS - 1]).toBe(kyivMondayStartMs(NOW));
    for (let i = 1; i < MATRIX_WEEKS; i += 1) {
      const prev = m.weekStarts[i - 1] ?? 0;
      const cur = m.weekStarts[i] ?? 0;
      expect(cur - prev).toBe(7 * DAY);
    }
  });

  it("додає вторинні мʼязи з вагою 0.55", () => {
    const m = buildMuscleWeekMatrix(
      [
        {
          startedAt: new Date(NOW).toISOString(),
          items: [
            {
              type: "strength",
              musclesPrimary: ["chest"],
              musclesSecondary: ["triceps"],
              sets: [{ weightKg: 100, reps: 10 }],
            },
          ],
        },
      ],
      null,
      NOW,
    );
    expect(m.rows.find((r) => r.id === "chest")?.latest).toBeCloseTo(1);
    expect(m.rows.find((r) => r.id === "triceps")?.latest).toBeCloseTo(0.55);
  });

  it("порожній вхід не кидає і дає max = 1", () => {
    const m = buildMuscleWeekMatrix(null, null, NOW);
    expect(m.rows).toEqual([]);
    expect(m.max).toBe(1);
    expect(m.weeksWithData).toBe(0);
  });
});

/**
 * Status: Active
 *
 * Що тут охороняється — саме те, заради чого вид існує: щоб матриця
 * доїжджала до екрана цілою, а не згорталась назад у один тиждень.
 */
import { afterEach, describe, expect, it } from "vitest";
import { deviceMondayStart } from "@sergeant/shared";
import {
  MATRIX_WEEKS,
  MIN_WEEKS_WITH_DATA,
  buildMuscleWeekMatrix,
} from "./muscleWeekMatrix";

const DAY = 24 * 60 * 60 * 1000;
/** Середа, щоб «понеділок тижня» не збігався з самою датою. */
const NOW = Date.parse("2026-08-05T12:00:00.000Z");

/** Тренування з `sets` робочими підходами 60×10 на один мʼяз. */
function strengthWorkout(atMs: number, muscle: string, sets: number) {
  return {
    startedAt: new Date(atMs).toISOString(),
    items: [
      {
        type: "strength",
        musclesPrimary: [muscle],
        sets: Array.from({ length: sets }, () => ({ weightKg: 60, reps: 10 })),
      },
    ],
  };
}

const originalTz = process.env["TZ"];

describe("buildMuscleWeekMatrix", () => {
  afterEach(() => {
    if (originalTz === undefined) delete process.env["TZ"];
    else process.env["TZ"] = originalTz;
  });

  it("Токіо: тренування о 00:30 понеділка за пристроєм — у поточному тижні", () => {
    process.env["TZ"] = "Asia/Tokyo"; // UTC+9
    // Пн 2026-08-03 00:30 JST = 2026-08-02T15:30Z (за Києвом ще неділя).
    const at = Date.parse("2026-08-02T15:30:00.000Z");
    const m = buildMuscleWeekMatrix(
      [strengthWorkout(at, "chest", 3)],
      null,
      Date.parse("2026-08-05T03:00:00.000Z"),
    );
    const chest = m.rows.find((r) => r.id === "chest");
    expect(chest?.weekly[MATRIX_WEEKS - 1]).toBeGreaterThan(0);
    expect(chest?.weekly[MATRIX_WEEKS - 2]).toBe(0);
  });

  it("тримає всі чотири тижні, а не лише останній", () => {
    const m = buildMuscleWeekMatrix(
      [
        strengthWorkout(NOW, "chest", 2),
        strengthWorkout(NOW - 7 * DAY, "chest", 1),
        strengthWorkout(NOW - 21 * DAY, "chest", 4),
      ],
      { chest: "Груди" },
      NOW,
    );

    expect(m.weekStarts).toHaveLength(MATRIX_WEEKS);
    const chest = m.rows.find((r) => r.id === "chest");
    expect(chest?.weekly).toHaveLength(MATRIX_WEEKS);
    // Найстаріший → найновіший: 21 днів тому, порожньо, тиждень тому, зараз.
    expect(chest?.weekly).toEqual([4, 0, 1, 2]);
    expect(chest?.latest).toBe(2);
  });

  it("тиждень без тренувань лишається НУЛЕМ, а не зникає", () => {
    const m = buildMuscleWeekMatrix(
      [strengthWorkout(NOW, "chest", 3)],
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
        strengthWorkout(NOW - 21 * DAY, "back", 4),
        // Груди: трохи, зате цього тижня.
        strengthWorkout(NOW, "chest", 1),
      ],
      null,
      NOW,
    );
    expect(m.rows[0]?.id).toBe("back");
  });

  it("нормалізує по ВСІЙ матриці, тож рядки лишаються порівнюваними", () => {
    const m = buildMuscleWeekMatrix(
      [strengthWorkout(NOW, "back", 4), strengthWorkout(NOW, "chest", 1)],
      null,
      NOW,
    );
    // Один спільний максимум: якби нормалізували по рядку, «груди» мали б
    // повний стовпчик і виглядали б як «спина».
    expect(m.max).toBeCloseTo(4);
  });

  it("рахує тижні з даними для порога мовчання", () => {
    const one = buildMuscleWeekMatrix(
      [strengthWorkout(NOW, "chest", 3)],
      null,
      NOW,
    );
    expect(one.weeksWithData).toBe(1);
    expect(one.weeksWithData).toBeLessThan(MIN_WEEKS_WITH_DATA);

    const two = buildMuscleWeekMatrix(
      [
        strengthWorkout(NOW, "chest", 3),
        strengthWorkout(NOW - 7 * DAY, "chest", 3),
      ],
      null,
      NOW,
    );
    expect(two.weeksWithData).toBe(MIN_WEEKS_WITH_DATA);
  });

  it("вікно вирівняне по понеділках пристрою (ADR-0078)", () => {
    const m = buildMuscleWeekMatrix([], null, NOW);
    expect(m.weekStarts[MATRIX_WEEKS - 1]).toBe(deviceMondayStart(NOW));
    for (let i = 1; i < MATRIX_WEEKS; i += 1) {
      const prev = m.weekStarts[i - 1] ?? 0;
      const cur = m.weekStarts[i] ?? 0;
      expect(cur - prev).toBe(7 * DAY);
    }
  });

  it("додає вторинні мʼязи половиною підходу", () => {
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
    expect(m.rows.find((r) => r.id === "chest")?.latest).toBe(1);
    expect(m.rows.find((r) => r.id === "triceps")?.latest).toBe(0.5);
  });

  it("підхід із власною вагою зараховується, порожній рядок — ні", () => {
    // Стара формула (кг×повт) давала нуль усім вправам без ваги: «0×15» на
    // сідничних не навантажувало жодного мʼяза.
    const m = buildMuscleWeekMatrix(
      [
        {
          startedAt: new Date(NOW).toISOString(),
          items: [
            {
              type: "strength",
              musclesPrimary: ["glutes"],
              sets: [
                { weightKg: 0, reps: 15 },
                { weightKg: 0, reps: 15 },
                { weightKg: 20, reps: 0 },
              ],
            },
          ],
        },
      ],
      null,
      NOW,
    );
    expect(m.rows.find((r) => r.id === "glutes")?.latest).toBe(2);
  });

  it("час і дистанція не змішуються з підходами", () => {
    const m = buildMuscleWeekMatrix(
      [
        {
          startedAt: new Date(NOW).toISOString(),
          items: [
            { type: "time", musclesPrimary: ["quadriceps"], durationSec: 1800 },
          ],
        },
      ],
      null,
      NOW,
    );
    expect(m.rows).toEqual([]);
    expect(m.weeksWithData).toBe(0);
  });

  it("підходи на час і дистанцію рахуються як підходи (предикат, спека прапорця)", () => {
    // До 2026-11-19 тут стояло `reps > 0`: планка 3×60 с давала мʼязу нуль
    // підходів, хоча людина зробила три. Секунди не змішуються з підходами —
    // рахується кількість зарахованих рядків, а не сума часу.
    const m = buildMuscleWeekMatrix(
      [
        {
          startedAt: new Date(NOW).toISOString(),
          items: [
            {
              type: "time",
              measure: "time",
              musclesPrimary: ["abs"],
              sets: [
                { weightKg: 0, reps: 0, durationSec: 60 },
                { weightKg: 0, reps: 0, durationSec: 60 },
                { weightKg: 0, reps: 0, durationSec: 0 },
              ],
            },
          ],
        },
      ],
      null,
      NOW,
    );
    expect(m.rows.find((r) => r.id === "abs")?.latest).toBe(2);
  });

  it("розминка й незроблений рядок не робочі підходи (П-Фз3-1)", () => {
    const m = buildMuscleWeekMatrix(
      [
        {
          startedAt: new Date(NOW).toISOString(),
          items: [
            {
              type: "strength",
              musclesPrimary: ["chest"],
              sets: [
                { weightKg: 20, reps: 10, done: true, setType: "warmup" },
                { weightKg: 80, reps: 8, done: false },
                { weightKg: 80, reps: 8, done: true, setType: "drop" },
                { weightKg: 80, reps: 8 },
              ],
            },
          ],
        },
      ],
      null,
      NOW,
    );
    expect(m.rows.find((r) => r.id === "chest")?.latest).toBe(2);
  });

  it("порожній вхід не кидає і дає max = 1", () => {
    const m = buildMuscleWeekMatrix(null, null, NOW);
    expect(m.rows).toEqual([]);
    expect(m.max).toBe(1);
    expect(m.weeksWithData).toBe(0);
  });
});

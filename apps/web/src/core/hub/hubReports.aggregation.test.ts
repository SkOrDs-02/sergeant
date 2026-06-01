/**
 * Snapshot tests for cross-module HubReports aggregation.
 *
 * Закриває аудитну задачу PR-7.C: «test(web,reports): HubReports aggregation
 * snapshot tests для крос-модульних звітів». До цього вся агрегація жила
 * inline у `HubReports.tsx` `useReportData` і не покривалася жодним юніт-
 * тестом. Тепер `hubReports.aggregation.ts` містить чисті функції, тут —
 * snapshot-фіксації їхнього вихідного контракту.
 *
 * Стратегія тестів:
 * - Date-helpers (`getPeriodRange`, `datesInRange`, `localDateKey`) — exact
 *   snapshots на конкретних `now`-датах (середа в середині місяця, край
 *   місяця, край року, високосний лютий).
 * - Per-module aggregators (`aggregateWorkouts`/`Spending`/`Habits`/`Kcal`) —
 *   реалістичні фікстури з усіма edge-cases, які траплялись inline у
 *   `useReportData`: workout без `endedAt`, archived habit, tx виключений
 *   через `excludedTxIds`, день без meal-у в nutrition-log.
 * - Cross-module `aggregateReport` — full snapshot на одному фіксованому
 *   `now` із усіма 4 модулями заповненими, щоб майбутні зміни в одному
 *   модулі не зламали якусь з полів.
 */

import { describe, expect, it } from "vitest";
import {
  aggregateHabits,
  aggregateKcal,
  aggregateReport,
  aggregateSpending,
  aggregateWorkouts,
  addDays,
  datesInRange,
  getPeriodRange,
  localDateKey,
} from "./hubReports.aggregation";

// ── Helper: фіксуємо `now` для детермінованих тестів ─────────────────────────
//
// Середа, 2025-04-09, 14:30 — посередині тижня (понеділок 2025-04-07,
// неділя 2025-04-13) і посередині місяця (квітень 2025: 1–30).
const NOW_WED = new Date(2025, 3, 9, 14, 30, 0);

// ── Date helpers ─────────────────────────────────────────────────────────────

describe("localDateKey", () => {
  it("форматує YYYY-MM-DD з нулями для Apr 9", () => {
    expect(localDateKey(new Date(2025, 3, 9))).toBe("2025-04-09");
  });

  it("форматує грудень 31", () => {
    expect(localDateKey(new Date(2025, 11, 31))).toBe("2025-12-31");
  });

  it("високосний лютий 29", () => {
    expect(localDateKey(new Date(2024, 1, 29))).toBe("2024-02-29");
  });
});

describe("addDays", () => {
  it("додає 7 днів через місячну межу", () => {
    expect(localDateKey(addDays(new Date(2025, 3, 28), 7))).toBe("2025-05-05");
  });

  it("віднімає (-3) через місячну межу", () => {
    expect(localDateKey(addDays(new Date(2025, 3, 1), -3))).toBe("2025-03-29");
  });

  it("0 повертає рівно ту ж дату", () => {
    expect(localDateKey(addDays(new Date(2025, 3, 9), 0))).toBe("2025-04-09");
  });
});

describe("getPeriodRange — week", () => {
  it("offset=0: пн–нд, що містить NOW_WED", () => {
    const { start, end } = getPeriodRange("week", 0, NOW_WED);
    expect(localDateKey(start)).toBe("2025-04-07"); // понеділок
    expect(localDateKey(end)).toBe("2025-04-13"); // неділя
  });

  it("offset=-1: попередній тиждень", () => {
    const { start, end } = getPeriodRange("week", -1, NOW_WED);
    expect(localDateKey(start)).toBe("2025-03-31");
    expect(localDateKey(end)).toBe("2025-04-06");
  });

  it("offset=+1: наступний тиждень", () => {
    const { start, end } = getPeriodRange("week", 1, NOW_WED);
    expect(localDateKey(start)).toBe("2025-04-14");
    expect(localDateKey(end)).toBe("2025-04-20");
  });

  it("now=неділя 2025-04-13: тиждень = пн 04-07 — нд 04-13 (включно)", () => {
    const sunday = new Date(2025, 3, 13, 23, 59, 0);
    const { start, end } = getPeriodRange("week", 0, sunday);
    expect(localDateKey(start)).toBe("2025-04-07");
    expect(localDateKey(end)).toBe("2025-04-13");
  });
});

describe("getPeriodRange — month", () => {
  it("квітень 2025 (30 днів)", () => {
    const { start, end } = getPeriodRange("month", 0, NOW_WED);
    expect(localDateKey(start)).toBe("2025-04-01");
    expect(localDateKey(end)).toBe("2025-04-30");
  });

  it("offset=-1 з квітня → березень (31 день)", () => {
    const { start, end } = getPeriodRange("month", -1, NOW_WED);
    expect(localDateKey(start)).toBe("2025-03-01");
    expect(localDateKey(end)).toBe("2025-03-31");
  });

  it("високосний лютий 2024", () => {
    const feb2024 = new Date(2024, 1, 15);
    const { start, end } = getPeriodRange("month", 0, feb2024);
    expect(localDateKey(start)).toBe("2024-02-01");
    expect(localDateKey(end)).toBe("2024-02-29");
  });

  it("не високосний лютий 2025", () => {
    const feb2025 = new Date(2025, 1, 15);
    const { end } = getPeriodRange("month", 0, feb2025);
    expect(localDateKey(end)).toBe("2025-02-28");
  });

  it("offset через річну межу: січень-2025 → грудень-2024", () => {
    const jan = new Date(2025, 0, 15);
    const { start, end } = getPeriodRange("month", -1, jan);
    expect(localDateKey(start)).toBe("2024-12-01");
    expect(localDateKey(end)).toBe("2024-12-31");
  });
});

describe("datesInRange", () => {
  it("тиждень: 7 послідовних YYYY-MM-DD", () => {
    const { start, end } = getPeriodRange("week", 0, NOW_WED);
    expect(datesInRange(start, end)).toMatchInlineSnapshot(`
      [
        "2025-04-07",
        "2025-04-08",
        "2025-04-09",
        "2025-04-10",
        "2025-04-11",
        "2025-04-12",
        "2025-04-13",
      ]
    `);
  });

  it("місяць квітень 2025: 30 днів", () => {
    const { start, end } = getPeriodRange("month", 0, NOW_WED);
    const dates = datesInRange(start, end);
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe("2025-04-01");
    expect(dates[29]).toBe("2025-04-30");
  });

  it("один день", () => {
    const d = new Date(2025, 3, 9);
    expect(datesInRange(d, d)).toEqual(["2025-04-09"]);
  });
});

// ── aggregateWorkouts ────────────────────────────────────────────────────────

describe("aggregateWorkouts", () => {
  const dates = ["2025-04-07", "2025-04-08", "2025-04-09"];

  it("LS-ключ відсутній → count: 0, daily: {} (early return)", () => {
    expect(aggregateWorkouts(null, dates)).toEqual({ count: 0, daily: {} });
  });

  it("malformed JSON → пустий результат (parseFizrukWorkouts swallow)", () => {
    expect(aggregateWorkouts("not valid json", dates)).toEqual({
      count: 0,
      daily: {},
    });
  });

  it("LS-ключ — порожній масив", () => {
    expect(aggregateWorkouts("[]", dates)).toEqual({ count: 0, daily: {} });
  });

  it("workout без endedAt — не рахуємо (in-progress скіпається)", () => {
    const raw = JSON.stringify([
      { startedAt: new Date(2025, 3, 8, 10, 0).getTime(), endedAt: null },
    ]);
    expect(aggregateWorkouts(raw, dates)).toEqual({ count: 0, daily: {} });
  });

  it("3 закінчених тренування у двох днях періоду + 1 поза періодом", () => {
    const raw = JSON.stringify([
      // 2 у вівторок 2025-04-08
      {
        startedAt: new Date(2025, 3, 8, 10, 0).getTime(),
        endedAt: new Date(2025, 3, 8, 11, 0).getTime(),
      },
      {
        startedAt: new Date(2025, 3, 8, 18, 0).getTime(),
        endedAt: new Date(2025, 3, 8, 19, 0).getTime(),
      },
      // 1 у середу 2025-04-09
      {
        startedAt: new Date(2025, 3, 9, 7, 0).getTime(),
        endedAt: new Date(2025, 3, 9, 8, 0).getTime(),
      },
      // поза періодом — не враховується
      {
        startedAt: new Date(2025, 3, 5, 10, 0).getTime(),
        endedAt: new Date(2025, 3, 5, 11, 0).getTime(),
      },
    ]);
    expect(aggregateWorkouts(raw, dates)).toMatchInlineSnapshot(`
      {
        "count": 3,
        "daily": {
          "2025-04-08": 2,
          "2025-04-09": 1,
        },
      }
    `);
  });

  it("парсить wrapped-shape `{ workouts: … }`", () => {
    const raw = JSON.stringify({
      workouts: [
        {
          startedAt: new Date(2025, 3, 9, 7, 0).getTime(),
          endedAt: new Date(2025, 3, 9, 8, 0).getTime(),
        },
      ],
    });
    expect(aggregateWorkouts(raw, dates)).toEqual({
      count: 1,
      daily: { "2025-04-09": 1 },
    });
  });
});

// ── aggregateSpending ────────────────────────────────────────────────────────

describe("aggregateSpending", () => {
  const dates = ["2025-04-07", "2025-04-08", "2025-04-09"];

  // Mono-API amounts are in kopecks; UAH = abs(amount) / 100. Хелпер бере UAH-
  // значення (negative для витрат) і конвертує у kopecks-shape, як це зробив
  // би webhook.
  function tx(id: string, amountUah: number, ts: number) {
    return { id, amount: amountUah * 100, time: ts, description: id };
  }

  it("порожні tx → total:0, daily:{}", () => {
    expect(
      aggregateSpending({ txList: [], excludedTxIds: [], txSplits: {} }, dates),
    ).toEqual({ total: 0, daily: {} });
  });

  it("дохід (amount > 0) ігнорується — рахуємо лише витрати", () => {
    const inputs = {
      txList: [
        tx("income", 5000, new Date(2025, 3, 8, 10, 0).getTime()),
        tx("food", -250, new Date(2025, 3, 8, 12, 0).getTime()),
      ],
      excludedTxIds: [],
      txSplits: {},
    };
    expect(aggregateSpending(inputs, dates)).toEqual({
      total: 250,
      daily: { "2025-04-08": 250 },
    });
  });

  it("excludedTxIds вилучає транзакцію зі статистики", () => {
    const inputs = {
      txList: [
        tx("food", -250, new Date(2025, 3, 8, 12, 0).getTime()),
        tx(
          "excluded-debt-payback",
          -10000,
          new Date(2025, 3, 8, 13, 0).getTime(),
        ),
      ],
      excludedTxIds: ["excluded-debt-payback"],
      txSplits: {},
    };
    expect(aggregateSpending(inputs, dates)).toEqual({
      total: 250,
      daily: { "2025-04-08": 250 },
    });
  });

  it("tx поза date-range ігнорується", () => {
    const inputs = {
      txList: [
        tx("in", -100, new Date(2025, 3, 8, 12, 0).getTime()),
        tx("out", -999, new Date(2025, 3, 5, 12, 0).getTime()), // не в dates
      ],
      excludedTxIds: [],
      txSplits: {},
    };
    expect(aggregateSpending(inputs, dates)).toEqual({
      total: 100,
      daily: { "2025-04-08": 100 },
    });
  });

  it("кілька витрат в один день → daily-сума, total = сума daily", () => {
    const inputs = {
      txList: [
        tx("a", -100, new Date(2025, 3, 8, 10, 0).getTime()),
        tx("b", -50, new Date(2025, 3, 8, 14, 0).getTime()),
        tx("c", -200, new Date(2025, 3, 9, 19, 0).getTime()),
      ],
      excludedTxIds: [],
      txSplits: {},
    };
    expect(aggregateSpending(inputs, dates)).toMatchInlineSnapshot(`
      {
        "daily": {
          "2025-04-08": 150,
          "2025-04-09": 200,
        },
        "total": 350,
      }
    `);
  });
});

// ── aggregateHabits ──────────────────────────────────────────────────────────

describe("aggregateHabits", () => {
  const dates = ["2025-04-07", "2025-04-08", "2025-04-09"];

  it("null state → 0/0", () => {
    expect(aggregateHabits(null, dates)).toEqual({ pct: 0, daily: {} });
  });

  it("state без habits → 0/0", () => {
    expect(aggregateHabits({}, dates)).toEqual({ pct: 0, daily: {} });
  });

  it("усі архівовані → 0/0 (effectively empty)", () => {
    const state = {
      habits: [{ id: "h1", archived: true }],
      completions: { h1: dates },
    };
    expect(aggregateHabits(state, dates)).toEqual({ pct: 0, daily: {} });
  });

  it("100% виконання: 2 звички × 3 дні = всі 6 виконано", () => {
    const state = {
      habits: [{ id: "h1" }, { id: "h2" }],
      completions: { h1: dates, h2: dates },
    };
    expect(aggregateHabits(state, dates)).toMatchInlineSnapshot(`
      {
        "daily": {
          "2025-04-07": 100,
          "2025-04-08": 100,
          "2025-04-09": 100,
        },
        "pct": 100,
      }
    `);
  });

  it("частково: 2 звички × 3 дні; h1 виконано двічі, h2 один раз → pct = round(3/6*100) = 50", () => {
    const state = {
      habits: [{ id: "h1" }, { id: "h2" }],
      completions: {
        h1: ["2025-04-07", "2025-04-09"], // 2 з 3
        h2: ["2025-04-08"], // 1 з 3
      },
    };
    expect(aggregateHabits(state, dates)).toMatchInlineSnapshot(`
      {
        "daily": {
          "2025-04-07": 50,
          "2025-04-08": 50,
          "2025-04-09": 50,
        },
        "pct": 50,
      }
    `);
  });

  it("daily-pct округлюється: 1 з 3 → 33%, 2 з 3 → 67%", () => {
    const state = {
      habits: [{ id: "h1" }, { id: "h2" }, { id: "h3" }],
      completions: {
        h1: ["2025-04-07"],
        h2: ["2025-04-08", "2025-04-09"],
        h3: ["2025-04-09"],
      },
    };
    const r = aggregateHabits(state, dates);
    expect(r.daily).toEqual({
      "2025-04-07": 33,
      "2025-04-08": 33,
      "2025-04-09": 67,
    });
  });

  it("архівована звичка не зменшує знаменник", () => {
    const state = {
      habits: [
        { id: "h1" },
        { id: "h2", archived: true }, // не рахується
      ],
      completions: {
        h1: dates, // 100% активних
      },
    };
    expect(aggregateHabits(state, dates).pct).toBe(100);
  });
});

// ── aggregateKcal ────────────────────────────────────────────────────────────

describe("aggregateKcal", () => {
  const dates = ["2025-04-07", "2025-04-08", "2025-04-09"];

  it("null log → 0", () => {
    expect(aggregateKcal(null, dates)).toEqual({
      total: 0,
      avg: 0,
      daily: {},
    });
  });

  it("два дні з meal-ами, один без → avg рахується по днях з даними (2)", () => {
    const log = {
      "2025-04-07": {
        meals: [{ macros: { kcal: 500 } }, { macros: { kcal: 600 } }],
      },
      "2025-04-08": {
        meals: [{ macros: { kcal: 1000 } }],
      },
      // 2025-04-09 без даних
      "2025-04-05": {
        // поза range
        meals: [{ macros: { kcal: 99999 } }],
      },
    };
    expect(aggregateKcal(log, dates)).toMatchInlineSnapshot(`
      {
        "avg": 1050,
        "daily": {
          "2025-04-07": 1100,
          "2025-04-08": 1000,
        },
        "total": 2100,
      }
    `);
  });

  it("meal без macros — не падає, kcal = 0", () => {
    const log = {
      "2025-04-07": {
        meals: [{}, { macros: { kcal: 200 } }],
      },
    };
    expect(aggregateKcal(log, dates).total).toBe(200);
  });

  it("meals не масив — даний день ігнорується", () => {
    const log = {
      "2025-04-07": { meals: "broken" as unknown as [] },
      "2025-04-08": { meals: [{ macros: { kcal: 300 } }] as unknown as [] },
    };
    expect(aggregateKcal(log, dates)).toEqual({
      total: 300,
      avg: 150, // 2 ключі (один з 0, інший з 300) → avg = 300/2 = 150
      daily: {
        "2025-04-07": 0,
        "2025-04-08": 300,
      },
    });
  });
});

// ── aggregateReport — cross-module ───────────────────────────────────────────

describe("aggregateReport — cross-module snapshot", () => {
  it("повний week-звіт із усіма 4 модулями заповненими — детермінований snapshot", () => {
    // Усі дати — у тижні NOW_WED (пн 2025-04-07 — нд 2025-04-13).
    const inputs = {
      rawFizrukWorkouts: JSON.stringify([
        {
          startedAt: new Date(2025, 3, 7, 10, 0).getTime(),
          endedAt: new Date(2025, 3, 7, 11, 0).getTime(),
        },
        {
          startedAt: new Date(2025, 3, 9, 18, 0).getTime(),
          endedAt: new Date(2025, 3, 9, 19, 0).getTime(),
        },
      ]),
      finyk: {
        txList: [
          // Amounts у kopecks (Mono-API формат): -150000 = -1500 UAH витрати.
          {
            id: "groceries",
            amount: -150000,
            time: new Date(2025, 3, 7, 12, 0).getTime(),
          },
          {
            id: "lunch",
            amount: -25000,
            time: new Date(2025, 3, 9, 13, 0).getTime(),
          },
          {
            id: "salary",
            amount: 5000000,
            time: new Date(2025, 3, 10, 9, 0).getTime(),
          },
        ],
        excludedTxIds: [],
        txSplits: {},
      },
      routineState: {
        habits: [{ id: "h1" }, { id: "h2" }],
        completions: {
          h1: ["2025-04-07", "2025-04-08", "2025-04-09"],
          h2: ["2025-04-07"],
        },
      },
      nutritionLog: {
        "2025-04-07": {
          meals: [{ macros: { kcal: 600 } }, { macros: { kcal: 800 } }],
        },
        "2025-04-09": {
          meals: [{ macros: { kcal: 1500 } }],
        },
      },
    };

    const report = aggregateReport("week", 0, inputs, NOW_WED);

    expect(report.period.dates).toEqual([
      "2025-04-07",
      "2025-04-08",
      "2025-04-09",
      "2025-04-10",
      "2025-04-11",
      "2025-04-12",
      "2025-04-13",
    ]);

    expect({
      workouts: report.workouts,
      spending: report.spending,
      habits: report.habits,
      kcal: report.kcal,
    }).toMatchInlineSnapshot(`
      {
        "habits": {
          "cur": {
            "daily": {
              "2025-04-07": 100,
              "2025-04-08": 50,
              "2025-04-09": 50,
              "2025-04-10": 0,
              "2025-04-11": 0,
              "2025-04-12": 0,
              "2025-04-13": 0,
            },
            "pct": 29,
          },
          "prev": {
            "daily": {
              "2025-03-31": 0,
              "2025-04-01": 0,
              "2025-04-02": 0,
              "2025-04-03": 0,
              "2025-04-04": 0,
              "2025-04-05": 0,
              "2025-04-06": 0,
            },
            "pct": 0,
          },
        },
        "kcal": {
          "cur": {
            "avg": 1450,
            "daily": {
              "2025-04-07": 1400,
              "2025-04-09": 1500,
            },
            "total": 2900,
          },
          "prev": {
            "avg": 0,
            "daily": {},
            "total": 0,
          },
        },
        "spending": {
          "cur": {
            "daily": {
              "2025-04-07": 1500,
              "2025-04-09": 250,
            },
            "total": 1750,
          },
          "prev": {
            "daily": {},
            "total": 0,
          },
        },
        "workouts": {
          "cur": {
            "count": 2,
            "daily": {
              "2025-04-07": 1,
              "2025-04-09": 1,
            },
          },
          "prev": {
            "count": 0,
            "daily": {},
          },
        },
      }
    `);
  });

  it("прев-період має правильні (пн-нд минулого тижня) дати", () => {
    const inputs = {
      rawFizrukWorkouts: JSON.stringify([
        // тренування у попередньому тижні
        {
          startedAt: new Date(2025, 3, 1, 10, 0).getTime(), // вт 2025-04-01
          endedAt: new Date(2025, 3, 1, 11, 0).getTime(),
        },
      ]),
      finyk: { txList: [], excludedTxIds: [], txSplits: {} },
      routineState: null,
      nutritionLog: {},
    };

    const report = aggregateReport("week", 0, inputs, NOW_WED);

    // Тренування 2025-04-01 — у попередньому тижні (пн 03-31 — нд 04-06).
    expect(report.workouts.cur.count).toBe(0); // не в поточному
    expect(report.workouts.prev.count).toBe(1);
    expect(report.workouts.prev.daily).toEqual({ "2025-04-01": 1 });
  });

  it("повністю порожній звіт: 0 у всіх модулях, daily-розклад звички = {} (no habits)", () => {
    const report = aggregateReport(
      "week",
      0,
      {
        rawFizrukWorkouts: null,
        finyk: { txList: [], excludedTxIds: [], txSplits: {} },
        routineState: null,
        nutritionLog: null,
      },
      NOW_WED,
    );

    expect(report.workouts.cur).toEqual({ count: 0, daily: {} });
    expect(report.spending.cur).toEqual({ total: 0, daily: {} });
    expect(report.habits.cur).toEqual({ pct: 0, daily: {} });
    expect(report.kcal.cur).toEqual({ total: 0, avg: 0, daily: {} });
  });

  it("month-агрегація правильно бере 30-денний квітень", () => {
    const report = aggregateReport(
      "month",
      0,
      {
        rawFizrukWorkouts: null,
        finyk: { txList: [], excludedTxIds: [], txSplits: {} },
        routineState: null,
        nutritionLog: null,
      },
      NOW_WED,
    );

    expect(report.period.dates).toHaveLength(30);
    expect(report.period.dates[0]).toBe("2025-04-01");
    expect(report.period.dates[29]).toBe("2025-04-30");
  });
});

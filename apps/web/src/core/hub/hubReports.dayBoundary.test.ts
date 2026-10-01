/**
 * Межа доби у «Звітах» хабу (рішення власника 2026-10-01, f6): гроші ріжуться
 * за Києвом, решта (звички, їжа, тренування) – за годинником телефона
 * (ADR-0078). До цього «Звіти» різали й гроші за телефоном, а Аналітика
 * Фініка – за Києвом, тож біля опівночі суми розходились.
 *
 * Годинник пристрою тут – UTC (`vitest.config.js` пінить `TZ: "UTC"`
 * навмисно): Київ це UTC+3 влітку, тож момент 21:30 UTC уже наступна доба за
 * Києвом і ще та сама – за телефоном.
 */
import { describe, expect, it } from "vitest";
import {
  aggregateReport,
  aggregateSpending,
  aggregateWorkouts,
  reportWindows,
} from "./hubReports.aggregation";

// Середа 2026-09-16 21:30 UTC = четвер 2026-09-17 00:30 за Києвом.
const NEAR_MIDNIGHT = new Date("2026-09-16T21:30:00Z");
const DATES = ["2026-09-15", "2026-09-16", "2026-09-17"];

function bankTx(id: string, uah: number, iso: string) {
  return {
    id,
    amount: Math.round(uah * 100),
    time: Date.parse(iso),
    description: id,
  };
}

describe("aggregateSpending: гроші ріжуться за Києвом", () => {
  it("витрата о 00:30 за Києвом лягає на київський день, а не на день телефона", () => {
    const result = aggregateSpending(
      {
        txList: [bankTx("late", -300, "2026-09-16T21:30:00Z")],
        excludedTxIds: [],
        txSplits: {},
      },
      DATES,
    );
    // За телефоном (UTC) це ще 16 вересня; Аналітика Фініка кладе її на 17-те.
    expect(result.daily).toEqual({ "2026-09-17": 300 });
  });

  it("витрата о 23:30 за Києвом лишається в своєму київському дні", () => {
    const result = aggregateSpending(
      {
        txList: [bankTx("evening", -120, "2026-09-16T20:30:00Z")],
        excludedTxIds: [],
        txSplits: {},
      },
      DATES,
    );
    expect(result.daily).toEqual({ "2026-09-16": 120 });
  });
});

describe("aggregateWorkouts: особисті записи ріжуться за телефоном", () => {
  it("тренування о 21:30 UTC лишається в дні телефона, хоч за Києвом уже наступний", () => {
    const startedAt = Date.parse("2026-09-16T21:30:00Z");
    const result = aggregateWorkouts(
      JSON.stringify([{ startedAt, endedAt: startedAt + 3_600_000 }]),
      DATES,
    );
    expect(result.daily).toEqual({ "2026-09-16": 1 });
  });
});

describe("reportWindows: «сьогодні» грошей київське", () => {
  it("біля опівночі вікно грошей уже на добу попереду вікна телефона", () => {
    const w = reportWindows("week", 0, NEAR_MIDNIGHT);
    expect(w.cur.at(-1)).toBe("2026-09-16");
    expect(w.money.cur.at(-1)).toBe("2026-09-17");
    // Минулий період – стільки ж перших днів, скільки прожито в кожному вікні.
    expect(w.prev).toHaveLength(w.cur.length);
    expect(w.money.prev).toHaveLength(w.money.cur.length);
    expect(w.money.cur).toHaveLength(w.cur.length + 1);
  });

  it("у Києві й на пристрої та сама доба: вікна збігаються", () => {
    const w = reportWindows("week", 0, new Date("2026-09-16T09:00:00Z"));
    expect(w.money.cur).toEqual(w.cur);
    expect(w.money.prev).toEqual(w.prev);
    expect(w.money.partial).toBe(w.partial);
  });

  it("завершений період: вікна збігаються без огляду на годинник", () => {
    const w = reportWindows("week", -1, NEAR_MIDNIGHT);
    expect(w.money.cur).toEqual(w.cur);
    expect(w.money.partial).toBe(false);
  });
});

describe("aggregateReport: гроші за Києвом, решта за телефоном в одному звіті", () => {
  it("витрата й тренування одного й того самого моменту лягають на різні дні", () => {
    const instant = "2026-09-16T21:30:00Z";
    const startedAt = Date.parse(instant);
    const report = aggregateReport(
      "week",
      0,
      {
        rawFizrukWorkouts: JSON.stringify([
          { startedAt, endedAt: startedAt + 3_600_000 },
        ]),
        finyk: {
          txList: [bankTx("late", -300, instant)],
          excludedTxIds: [],
          txSplits: {},
        },
        routineState: null,
        nutritionLog: {},
      },
      NEAR_MIDNIGHT,
    );
    // Київська доба вже 17-те й входить у «сьогодні» грошей; телефон ще 16-те.
    expect(report.spending.cur).toEqual({
      total: 300,
      daily: { "2026-09-17": 300 },
    });
    expect(report.workouts.cur.daily).toEqual({ "2026-09-16": 1 });
  });
});

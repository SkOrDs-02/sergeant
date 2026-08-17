import { describe, it, expect } from "vitest";
import { buildHabitRangeRows } from "./habitRangeRows.js";
import type { Habit, HabitSkip } from "./types.js";

// Локальний полудень, щоб арифметика вікна не залежала від DST-переходів.
const TODAY = new Date(2026, 0, 10, 12, 0, 0, 0); // пт 2026-01-10

function dailyHabit(id = "h1", over: Partial<Habit> = {}): Habit {
  return {
    id,
    name: id,
    archived: false,
    recurrence: "daily",
    startDate: "2026-01-01",
    endDate: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    ...over,
  };
}

function skip(): HabitSkip {
  return { reason: "sick", at: "2026-01-08T10:00:00.000Z" };
}

describe("routine-domain/habitRangeRows", () => {
  it("builds one row per active habit with `days` cells ending today", () => {
    const rows = buildHabitRangeRows(
      [dailyHabit("a"), dailyHabit("b")],
      { a: [], b: [] },
      TODAY,
      7,
    );

    expect(rows.map((r) => r.habitId)).toEqual(["a", "b"]);
    for (const row of rows) {
      expect(row.cells).toHaveLength(7);
      expect(row.cells[0]?.dateKey).toBe("2026-01-04");
      expect(row.cells[6]?.dateKey).toBe("2026-01-10");
      expect(row.cells[6]?.isToday).toBe(true);
      expect(row.cells[0]?.isToday).toBe(false);
    }
  });

  it("classifies done / missed / skipped / unscheduled per day", () => {
    const habit = dailyHabit("a", {
      recurrence: "weekly",
      // Пн=0 … Нд=6 — беремо пн/ср/пт.
      weekdays: [0, 2, 4],
    });
    const rows = buildHabitRangeRows(
      [habit],
      // пн 2026-01-05 виконано, ср 2026-01-07 — «не зміг», пт 2026-01-09 — тиша.
      { a: ["2026-01-05"] },
      TODAY,
      7,
      { skips: { a: { "2026-01-07": skip() } } },
    );

    const row = rows[0];
    expect(row).toBeDefined();
    const byKey = new Map(row!.cells.map((c) => [c.dateKey, c.state]));
    expect(byKey.get("2026-01-05")).toBe("done");
    expect(byKey.get("2026-01-07")).toBe("skipped");
    expect(byKey.get("2026-01-09")).toBe("missed");
    // Вихідні поза розкладом.
    expect(byKey.get("2026-01-04")).toBe("unscheduled");
    expect(byKey.get("2026-01-10")).toBe("unscheduled");
  });

  it("keeps skipped days inside the denominator so rows match Зведення", () => {
    // Свідома асиметрія: клітинка показує `skipped` окремим станом, але зі
    // знаменника день не виходить — так само, як його рахує
    // `completionRateForRange` без опції `skips` (див. AI-CONTEXT у модулі).
    const rows = buildHabitRangeRows(
      [dailyHabit("a")],
      { a: ["2026-01-10"] },
      TODAY,
      3,
      { skips: { a: { "2026-01-09": skip() } } },
    );

    const row = rows[0];
    expect(row?.scheduled).toBe(3);
    expect(row?.completed).toBe(1);
    expect(row?.skipped).toBe(1);
    expect(row?.rate).toBeCloseTo(1 / 3);
  });

  it("drops habits with nothing scheduled in the window", () => {
    const rows = buildHabitRangeRows(
      [
        dailyHabit("daily"),
        // Місячна звичка з анкором 1-го числа не потрапляє у вікно 04..10.
        dailyHabit("monthly", { recurrence: "monthly" }),
        // Звичка, створена після кінця вікна.
        dailyHabit("future", { startDate: "2026-02-01" }),
      ],
      {},
      TODAY,
      7,
    );

    expect(rows.map((r) => r.habitId)).toEqual(["daily"]);
  });

  it("excludes archived habits", () => {
    const rows = buildHabitRangeRows(
      [dailyHabit("a", { archived: true }), dailyHabit("b")],
      {},
      TODAY,
      7,
    );
    expect(rows.map((r) => r.habitId)).toEqual(["b"]);
  });

  it("freezePausedPast keeps a paused habit's history in the window", () => {
    const paused = dailyHabit("p", { paused: true });

    // Без прапорця недатований `paused` вимиває звичку з усього вікна.
    expect(buildHabitRangeRows([paused], {}, TODAY, 7)).toEqual([]);

    const [row] = buildHabitRangeRows([paused], {}, TODAY, 7, {
      freezePausedPast: true,
    });
    // Минулі дні лишаються запланованими, сьогодні — вже ні (ADR-0079 §3).
    expect(row?.scheduled).toBe(6);
    expect(row?.cells.at(-1)?.state).toBe("unscheduled");
  });

  it("marks weekday index Monday-first for axis labels", () => {
    const [row] = buildHabitRangeRows([dailyHabit("a")], {}, TODAY, 7);
    // Вікно 2026-01-04 (нд) … 2026-01-10 (сб).
    expect(row?.cells.map((c) => c.weekday)).toEqual([6, 0, 1, 2, 3, 4, 5]);
  });

  it("tolerates empty / nullish input", () => {
    expect(buildHabitRangeRows(null, null, TODAY, 7)).toEqual([]);
    expect(buildHabitRangeRows([], {}, TODAY, 7)).toEqual([]);
    // `days` нижче 1 підтягується до 1 замість порожнього рядка.
    expect(
      buildHabitRangeRows([dailyHabit("a")], {}, TODAY, 0)[0]?.cells,
    ).toHaveLength(1);
  });
});

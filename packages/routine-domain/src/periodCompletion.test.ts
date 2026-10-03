import { describe, it, expect } from "vitest";

import { calcRoutinePeriodCompletion } from "./periodCompletion.js";
import { completionRateForRange } from "./streaks.js";
import type { Habit } from "./types.js";

/**
 * Канонічне «% виконання звичок за період» — W1-CANON-AGG стадія 4.
 *
 * Головний тест тут — не окремі числа, а **збіг із `completionRateForRange`**:
 * дві функції зобовʼязані давати однаковий знаменник, інакше «одна метрика —
 * одна агрегація» знову розсипається на дві реалізації.
 */

// Пн 2026-05-04 … Нд 2026-05-10.
const WEEK = [
  "2026-05-04",
  "2026-05-05",
  "2026-05-06",
  "2026-05-07",
  "2026-05-08",
  "2026-05-09",
  "2026-05-10",
];

// Пн / Ср / Пт (Monday-first, 0–6).
const MWF: Habit = {
  id: "h1",
  name: "Зарядка",
  recurrence: "weekly",
  weekdays: [0, 2, 4],
  startDate: "2026-01-01",
} as Habit;

const DAILY: Habit = {
  id: "h2",
  name: "Вода",
  recurrence: "daily",
  startDate: "2026-01-01",
} as Habit;

describe("calcRoutinePeriodCompletion", () => {
  it("звичка Пн/Ср/Пт, виконана 3/3 — це 100%, а не 43%", () => {
    const r = calcRoutinePeriodCompletion(
      [MWF],
      { h1: ["2026-05-04", "2026-05-06", "2026-05-08"] },
      WEEK,
    );
    expect(r).toMatchObject({ completed: 3, scheduled: 3, pct: 100 });
    expect(r.perHabit[0]).toMatchObject({
      id: "h1",
      done: 3,
      scheduled: 3,
      completionRate: 100,
    });
  });

  it("сходиться з completionRateForRange на тих самих даних", () => {
    const completions = {
      h1: ["2026-05-04", "2026-05-06"],
      h2: ["2026-05-04"],
    };
    const mine = calcRoutinePeriodCompletion([MWF, DAILY], completions, WEEK);
    const canon = completionRateForRange(
      [MWF, DAILY],
      completions,
      WEEK[0]!,
      WEEK[6]!,
    );
    expect(mine.completed).toBe(canon.completed);
    expect(mine.scheduled).toBe(canon.scheduled);
    expect(mine.pct).toBe(Math.round(canon.rate * 100));
  });

  it("подобова розкладка рахує лише заплановане на цей день", () => {
    const r = calcRoutinePeriodCompletion(
      [MWF, DAILY],
      { h1: ["2026-05-04"], h2: ["2026-05-04", "2026-05-05"] },
      WEEK,
    );
    // Пн: заплановані обидві, виконані обидві → 100%.
    expect(r.daily["2026-05-04"]).toBe(100);
    // Вт: запланована лише щоденна, і вона виконана → 100%, а не 50%.
    expect(r.daily["2026-05-05"]).toBe(100);
    // Ср: заплановані обидві, виконана жодна → 0%.
    expect(r.daily["2026-05-06"]).toBe(0);
  });

  it("день без запланованого дає 0% і порожній знаменник", () => {
    const r = calcRoutinePeriodCompletion([MWF], {}, WEEK);
    // Вт на Пн/Ср/Пт не планується — знаменник порожній.
    expect(r.daily["2026-05-05"]).toBe(0);
    expect(r.scheduled).toBe(3);
  });

  it("archived звички не потрапляють ані в знаменник, ані в perHabit", () => {
    const archived = { ...DAILY, archived: true } as Habit;
    const r = calcRoutinePeriodCompletion([MWF, archived], {}, WEEK);
    expect(r.perHabit).toHaveLength(1);
    expect(r.scheduled).toBe(3);
  });

  it("порожній вхід не ділить на нуль", () => {
    expect(calcRoutinePeriodCompletion([], {}, WEEK)).toMatchObject({
      completed: 0,
      scheduled: 0,
      pct: 0,
    });
    expect(calcRoutinePeriodCompletion([MWF], {}, [])).toMatchObject({
      scheduled: 0,
      pct: 0,
    });
  });

  it("pausedFrom лишає минуле в знаменнику", () => {
    const paused = { ...MWF, paused: true } as Habit;
    // Без опції пауза ретроактивна — звичка зникає з періоду цілком.
    expect(calcRoutinePeriodCompletion([paused], {}, WEEK).scheduled).toBe(0);
    // З опцією минулий тиждень лишається запланованим.
    const frozen = calcRoutinePeriodCompletion([paused], {}, WEEK, {
      pausedFrom: "2026-06-01",
    });
    expect(frozen.scheduled).toBe(3);
  });

  it("skips виключає «не зміг» зі знаменника, як completionRateForRange (finding 1.7)", () => {
    // Пн/Ср/Пт виконана в Пн, у Ср позначена «не зміг».
    const completions = { h1: ["2026-05-04"] };
    const skips = {
      h1: { "2026-05-06": { reason: "sick" as const, at: "" } },
    };
    const withSkips = calcRoutinePeriodCompletion([MWF], completions, WEEK, {
      skips,
    });
    // Знаменник 2 (Пн + Пт), не 3 — середа не рахується провалом.
    expect(withSkips).toMatchObject({ completed: 1, scheduled: 2, pct: 50 });

    const canon = completionRateForRange(
      [MWF],
      completions,
      WEEK[0]!,
      WEEK[6]!,
      { skips },
    );
    expect(withSkips.completed).toBe(canon.completed);
    expect(withSkips.scheduled).toBe(canon.scheduled);

    // Без опції — стара поведінка: пропуск рахується провалом.
    const withoutSkips = calcRoutinePeriodCompletion([MWF], completions, WEEK);
    expect(withoutSkips.scheduled).toBe(3);
  });
});

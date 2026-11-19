import { describe, expect, it } from "vitest";
import { flexibleStreakBreakdown, type Habit } from "@sergeant/routine-domain";
import { graceSourceLine, graceUsedLabel } from "./graceStockCopy";

const TODAY = "2026-08-02";

function daily(startDate = "2026-01-01"): Habit {
  return { id: "h", name: "Зарядка", recurrence: "daily", startDate };
}

/** Ключі за N днів поспіль, що закінчуються на `endKey` включно. */
function runOfDays(endKey: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${endKey}T12:00:00`);
  for (let i = 0; i < count; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return out.sort();
}

const line = (h: Habit, done: string[]) =>
  graceSourceLine(flexibleStreakBreakdown(h, done, TODAY));

describe("graceSourceLine: пояснення описує запас, що лишився", () => {
  it("нова звичка: стартова є, зароблених немає", () => {
    expect(line(daily(), [])).toBe("1 стартова. Наступна через 7 виконань.");
  });

  it("нічого не витрачено: звідки складається запас", () => {
    expect(line(daily(), runOfDays(TODAY, 14))).toBe(
      "1 стартова і 2 за 14 виконань. Наступна через 7 виконань.",
    );
  });

  it("стартову витрачено, зароблених немає: так і каже", () => {
    // 5 виконаних, пропуск 08-01, відмітка сьогодні.
    const done = [...runOfDays("2026-07-31", 5), TODAY];
    const b = flexibleStreakBreakdown(daily("2026-07-27"), done, TODAY);
    expect(b.graceRemaining).toBe(0);
    expect(graceSourceLine(b)).toBe(
      "Стартову витрачено. Наступна через 1 виконання.",
    );
  });

  it("частину витрачено, запас ще є: без історії бюджету, лише наступна", () => {
    // 12 виконаних, один пропуск: бюджет 2, витрачено 1, лишилась 1.
    const done = [...runOfDays("2026-07-30", 10), ...runOfDays(TODAY, 2)];
    const b = flexibleStreakBreakdown(daily(), done, TODAY);
    expect(b.graceRemaining).toBe(1);
    expect(graceSourceLine(b)).toBe("Наступна через 2 виконання.");
  });

  it("витрачено і стартову, і зароблені: запас вичерпано", () => {
    // 12 виконаних, два пропуски: бюджет 2, обидві витрачено.
    const habit = daily("2026-07-20");
    const done = runOfDays(TODAY, 14).filter(
      (k) => k !== "2026-07-24" && k !== "2026-07-30",
    );
    const b = flexibleStreakBreakdown(habit, done, TODAY);
    expect(b.graceRemaining).toBe(0);
    expect(graceSourceLine(b)).toBe(
      "Запас вичерпано. Наступна через 2 виконання.",
    );
  });

  it("стеля без витрат: звідки запас і що більше не накопичується", () => {
    expect(line(daily(), runOfDays(TODAY, 30))).toBe(
      "1 стартова і 3 за 30 виконань. Більше не накопичується.",
    );
  });

  it("стеля з витратою: лише те, що більше не накопичується", () => {
    // 30 виконаних до 07-03 + пропуск 07-03 + решта до сьогодні.
    const done = runOfDays(TODAY, 40).filter((k) => k !== "2026-07-20");
    const b = flexibleStreakBreakdown(daily(), done, TODAY);
    expect(b.graceUsed).toBe(1);
    expect(b.daysToNextGrace).toBeNull();
    expect(graceSourceLine(b)).toBe("Більше не накопичується.");
  });

  it("разова подія: порожньо", () => {
    const b = flexibleStreakBreakdown(
      { ...daily(), recurrence: "once" },
      [],
      TODAY,
    );
    expect(graceSourceLine(b)).toBe("");
  });
});

describe("graceUsedLabel: узгодження за числом", () => {
  it.each([
    [1, "1 заморозку витрачено"],
    [2, "2 заморозки витрачено"],
    [4, "4 заморозки витрачено"],
    [5, "5 заморозок витрачено"],
    [11, "11 заморозок витрачено"],
    [21, "21 заморозку витрачено"],
  ])("%i → %s", (n, expected) => {
    expect(graceUsedLabel(n)).toBe(expected);
  });
});

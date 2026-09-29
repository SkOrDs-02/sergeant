import { describe, expect, it } from "vitest";

import { detectRoutineMoment } from "./moments";
import {
  TODAY,
  checkToday,
  daysBefore,
  daysRange,
  habit,
  state,
} from "./momentsFixtures";

/**
 * Право мовчати (ADR-0096 § Compliance): рядовий запис, який нічого не
 * змінив, не дає жодного рядка.
 */
describe("рядовий запис мовчить", () => {
  const prev = state([habit("a"), habit("b")], {
    a: daysRange(2, 1),
    b: daysRange(2, 1),
  });

  it("не остання звичка дня з короткою серією не дає рядка", () => {
    const next = checkToday(prev, "a");
    expect(
      detectRoutineMoment({
        prev,
        next,
        habitId: "a",
        dateKey: TODAY,
        todayKey: TODAY,
      }),
    ).toBeNull();
  });

  it("зняття відмітки моменту не дає", () => {
    const done = checkToday(prev, "a");
    expect(
      detectRoutineMoment({
        prev: done,
        next: prev,
        habitId: "a",
        dateKey: TODAY,
        todayKey: TODAY,
      }),
    ).toBeNull();
  });

  it("відмітка за минулий день не має «сьогодні», у якому жити", () => {
    const yesterday = daysBefore(1);
    const before = state([habit("a")], { a: daysRange(7, 2) });
    const after = state([habit("a")], { a: daysRange(7, 1) });
    expect(
      detectRoutineMoment({
        prev: before,
        next: after,
        habitId: "a",
        dateKey: yesterday,
        todayKey: TODAY,
      }),
    ).toBeNull();
  });
});

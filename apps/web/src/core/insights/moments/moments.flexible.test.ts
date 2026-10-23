import { describe, expect, it } from "vitest";

import { detectRoutineMoment } from "./moments";
import { TODAY, checkToday, daysBefore, habit, state } from "./momentsFixtures";

/**
 * logic-11 / logic-22: момент серії для гнучкої звички («N разів на
 * тиждень») міряється тижнями, а не поденним `flexibleStreakBreakdown`.
 * TODAY (2026-08-20) це четвер.
 */
describe("момент серії гнучкої звички", () => {
  const flex = habit("f", {
    recurrence: "flexible",
    weeklyTargetHistory: [{ from: "2020-01-01", target: 1 }],
  });
  // Понеділки: 17.08 (поточний тиждень) і шість попередніх тижнів.
  const mondays = (n: number) =>
    Array.from({ length: n }, (_, i) => daysBefore(3 + 7 * (n - i)));

  function momentFor(prevCompletions: string[]) {
    const prev = state([flex], { f: prevCompletions });
    return detectRoutineMoment({
      prev,
      next: checkToday(prev, "f"),
      habitId: "f",
      dateKey: TODAY,
      todayKey: TODAY,
    });
  }

  it.each([4, 12, 26, 52])("%i-й тиждень поспіль дає ступінь у тижнях", (n) => {
    expect(momentFor(mondays(n - 1))).toEqual({
      kind: "streak",
      target: "f",
      value: n,
      unit: "weeks",
    });
  });

  it("сьомий тиждень поспіль ступеня не дає (денна драбина 7 не діє)", () => {
    expect(momentFor(mondays(6))).not.toMatchObject({ kind: "streak" });
  });

  it("повтор відмітки в тому ж тижні без тижневого поступу ступеня не дає", () => {
    // Дві відмітки в одному тижні: тижнів лишилось 6, а не 7.
    expect(momentFor(mondays(5))).not.toMatchObject({ kind: "streak" });
  });

  it("четвертий тиждень уже закрито раніше цього тижня: ступінь не повторюється", () => {
    expect(momentFor([...mondays(3), daysBefore(1)])).not.toMatchObject({
      kind: "streak",
    });
  });
});

import { describe, expect, it } from "vitest";

import { DAY_TARGET, detectRoutineMoment, pickRarest } from "./moments";
import { TODAY, checkToday, daysRange, habit, state } from "./momentsFixtures";

/**
 * Правило збігу (ADR-0096 § Compliance): запис, що влучає у два моменти
 * одразу, дає рівно один рядок, і це найрідкісніший.
 */
describe("правило збігу", () => {
  function momentFor(prevCompletions: string[]) {
    const prev = state([habit("a")], { a: prevCompletions });
    return detectRoutineMoment({
      prev,
      next: checkToday(prev, "a"),
      habitId: "a",
      dateKey: TODAY,
      todayKey: TODAY,
    });
  }

  it("остання звичка дня, що дає серію 7, дає рядок серії, не закритого дня", () => {
    expect(momentFor(daysRange(6, 1))).toEqual({
      kind: "streak",
      target: "a",
      value: 7,
    });
  });

  it("єдина звичка без ступеня серії закриває день", () => {
    expect(momentFor(daysRange(2, 1))).toEqual({
      kind: "dayClosed",
      target: DAY_TARGET,
    });
  });

  it("заморозка рідкісніша за закритий день", () => {
    // 13 виконаних днів заробили заморозку, вчора пропуск, сьогодні
    // відмітка: серія пережила пропуск.
    expect(momentFor(daysRange(14, 2))).toMatchObject({
      kind: "freeze",
      target: "a",
    });
  });

  it("поріг інсайту рідкісніший за все інше в тому самому записі", () => {
    // 27 відміток за два місяці й чотири тижні; сьогоднішня дає 28-му.
    const prev = state([habit("a")], { a: daysRange(27, 1) });
    expect(
      detectRoutineMoment({
        prev,
        next: checkToday(prev, "a"),
        habitId: "a",
        dateKey: TODAY,
        todayKey: TODAY,
      }),
    ).toEqual({ kind: "threshold", target: "a" });
  });

  it("pickRarest бере перший за рідкістю незалежно від порядку", () => {
    expect(
      pickRarest([
        { kind: "dayClosed", target: DAY_TARGET },
        { kind: "approach", target: "a", value: 3 },
        { kind: "streak", target: "a", value: 30 },
      ]),
    ).toEqual({ kind: "streak", target: "a", value: 30 });
    expect(pickRarest([])).toBeNull();
  });
});

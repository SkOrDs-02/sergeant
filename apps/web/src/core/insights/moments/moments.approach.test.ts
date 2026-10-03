import { describe, expect, it } from "vitest";

import { approachRemaining, detectRoutineMoment } from "./moments";
import { TODAY, checkToday, daysRange, habit, state } from "./momentsFixtures";

/** Наближення: 20% від порога, а не фіксоване число (ADR-0096). */
describe("наближення до порога", () => {
  it("для порога 20 показує останні чотири, а на 15-му мовчить", () => {
    expect(approachRemaining(15, 20)).toBeNull();
    expect(approachRemaining(16, 20)).toBe(4);
    expect(approachRemaining(17, 20)).toBe(3);
    expect(approachRemaining(19, 20)).toBe(1);
  });

  it("для порога 10 показує останні два", () => {
    expect(approachRemaining(7, 10)).toBeNull();
    expect(approachRemaining(8, 10)).toBe(2);
  });

  it("на порозі й за ним наближення немає: там уже момент або тиша", () => {
    expect(approachRemaining(20, 20)).toBeNull();
    expect(approachRemaining(25, 20)).toBeNull();
  });

  it("звичка на останніх 20% до висновку каже, скільки відміток лишилось", () => {
    // 23 відмітки звички «a» за чотири тижні й два місяці; друга звичка
    // ще не відмічена, тож день не закривається і не перебиває рядок.
    const prev = state([habit("a"), habit("b")], { a: daysRange(23, 1) });
    expect(
      detectRoutineMoment({
        prev,
        next: checkToday(prev, "a"),
        habitId: "a",
        dateKey: TODAY,
        todayKey: TODAY,
      }),
    ).toEqual({ kind: "approach", target: "a", value: 4 });
  });

  it("мовчить, коли до висновку бракує не лише відміток", () => {
    // Після запису 25 відміток, тобто до порога лишилось три, але всі за
    // три тижні одного місяця: на 28-й висновок не зʼявиться, тож і
    // обіцяти його не можна.
    const prev = state([habit("a"), habit("b"), habit("c")], {
      a: daysRange(12, 1),
      b: daysRange(12, 1),
    });
    expect(
      detectRoutineMoment({
        prev,
        next: checkToday(prev, "a"),
        habitId: "a",
        dateKey: TODAY,
        todayKey: TODAY,
      }),
    ).toBeNull();
  });
});

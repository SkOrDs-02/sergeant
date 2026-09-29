import { describe, expect, it } from "vitest";
import { toLocalISODate } from "@sergeant/shared";

import {
  dateKeyDaysAgo,
  parseScenarioLocalWorld,
  resolveRoutineHabit,
} from "./world";

describe("parseScenarioLocalWorld", () => {
  it("приймає мінімальний світ і дає порожні списки", () => {
    const world = parseScenarioLocalWorld({ scenario: "empty" });
    expect(world.pantryItems).toEqual([]);
    expect(world.fizrukWorkouts).toEqual([]);
  });

  it("відхиляє невідоме поле", () => {
    expect(() =>
      parseScenarioLocalWorld({ scenario: "empty", extra: 1 }),
    ).toThrow(/невідоме поле 'extra'/);
  });

  it("відхиляє невідомий id світу", () => {
    expect(() => parseScenarioLocalWorld({ scenario: "v2-world" })).toThrow(
      /невідомий id/,
    );
  });

  it("відхиляє відʼємний daysAgo", () => {
    expect(() =>
      parseScenarioLocalWorld({
        scenario: "fizruk-active-session",
        fizrukWorkouts: [{ id: "w", daysAgo: -1, items: [] }],
      }),
    ).toThrow(/daysAgo/);
  });
});

describe("дати світу", () => {
  it("daysAgo 0 це сьогоднішній device-local ключ", () => {
    expect(dateKeyDaysAgo(0)).toBe(toLocalISODate(new Date()));
  });

  it("стрік N дає N відміток, що закінчуються сьогодні", () => {
    const now = new Date(2026, 8, 29, 12);
    const habit = resolveRoutineHabit(
      { id: "h", name: "Вода", streakDays: 7, missedYesterday: false },
      now,
    );
    expect(habit.dateKeys).toHaveLength(7);
    expect(habit.dateKeys[0]).toBe("2026-09-29");
    expect(habit.startDate).toBe("2026-09-22");
  });
});

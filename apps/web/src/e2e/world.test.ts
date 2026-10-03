import { describe, expect, it } from "vitest";
import { deviceDayKey, toKyivISODate } from "@sergeant/shared";

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
    expect(dateKeyDaysAgo(0)).toBe(deviceDayKey(new Date()));
  });

  it("ключ дня береться з годинника пристрою, а не з Києва (ADR-0078)", () => {
    // 22:30 UTC: на пристрої (TZ=UTC у vitest.config.js) ще 2026-06-23, а в
    // Києві (UTC+3 влітку) уже 01:30 наступної доби. CI-лейни теж їдуть у UTC.
    const now = new Date("2026-06-23T22:30:00Z");
    expect(toKyivISODate(now)).toBe("2026-06-24");
    expect(dateKeyDaysAgo(0, now)).toBe("2026-06-23");
    expect(dateKeyDaysAgo(1, now)).toBe("2026-06-22");
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

  it("стрік на межі київської доби лишається в добі пристрою", () => {
    const now = new Date("2026-06-23T22:30:00Z");
    const habit = resolveRoutineHabit(
      { id: "h", name: "Вода", streakDays: 1, missedYesterday: true },
      now,
    );
    expect(habit.dateKeys).toEqual(["2026-06-23"]);
    expect(habit.startDate).toBe("2026-06-16");
    expect(habit.missedDateKey).toBe("2026-06-22");
  });
});

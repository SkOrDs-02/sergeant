import { describe, expect, it } from "vitest";

import type { Habit } from "./types.js";
import {
  appendWeeklyTargetInterval,
  dateKeyWithinHabitBounds,
  flexibleHabitAvailableOnDate,
  isFlexibleHabit,
  normalizeWeeklyTarget,
  normalizeWeeklyTargetHistory,
  weekDoneCountExcludingDate,
  weekEndKeyForDateKey,
  weekStartKeyForDateKey,
  weeklyTargetForDate,
} from "./weeklyTarget.js";

function habit(patch: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    name: "Зарядка",
    recurrence: "flexible",
    startDate: "2026-01-01",
    ...patch,
  };
}

describe("normalizeWeeklyTarget", () => {
  it("тримає ціль у 1..7 і відрізає дріб", () => {
    expect(normalizeWeeklyTarget(0)).toBe(1);
    expect(normalizeWeeklyTarget(9)).toBe(7);
    expect(normalizeWeeklyTarget(3.9)).toBe(3);
    expect(normalizeWeeklyTarget("4")).toBe(4);
  });

  it("нечислове значення падає на дефолт", () => {
    expect(normalizeWeeklyTarget(undefined)).toBe(3);
    expect(normalizeWeeklyTarget("не число")).toBe(3);
  });
});

describe("normalizeWeeklyTargetHistory", () => {
  it("відкидає сміття і сортує за датою", () => {
    expect(
      normalizeWeeklyTargetHistory([
        { from: "2026-02-01", target: 5 },
        null,
        "рядок",
        { from: "не-дата", target: 2 },
        { from: "2026-01-01", target: 2 },
      ]),
    ).toEqual([
      { from: "2026-01-01", target: 2 },
      { from: "2026-02-01", target: 5 },
    ]);
  });

  it("не-масив дає порожню історію", () => {
    expect(normalizeWeeklyTargetHistory(undefined)).toEqual([]);
  });

  it("однакова дата — виграє останній запис", () => {
    expect(
      normalizeWeeklyTargetHistory([
        { from: "2026-01-01", target: 2 },
        { from: "2026-01-01", target: 6 },
      ]),
    ).toEqual([{ from: "2026-01-01", target: 6 }]);
  });

  it("сусідні записи з тією ж ціллю схлопуються", () => {
    expect(
      normalizeWeeklyTargetHistory([
        { from: "2026-01-01", target: 4 },
        { from: "2026-02-01", target: 4 },
        { from: "2026-03-01", target: 2 },
      ]),
    ).toEqual([
      { from: "2026-01-01", target: 4 },
      { from: "2026-03-01", target: 2 },
    ]);
  });
});

describe("weeklyTargetForDate", () => {
  it("порожня історія дає дефолт", () => {
    expect(weeklyTargetForDate(habit(), "2026-01-07")).toBe(3);
  });

  it("бере останній інтервал, що почався не пізніше дати", () => {
    const h = habit({
      weeklyTargetHistory: [
        { from: "2026-01-01", target: 2 },
        { from: "2026-02-01", target: 6 },
      ],
    });
    expect(weeklyTargetForDate(h, "2025-12-31")).toBe(3);
    expect(weeklyTargetForDate(h, "2026-01-15")).toBe(2);
    expect(weeklyTargetForDate(h, "2026-03-01")).toBe(6);
  });
});

describe("appendWeeklyTargetInterval", () => {
  it("дописує запис до порожньої історії", () => {
    expect(appendWeeklyTargetInterval(undefined, "2026-01-05", 4)).toEqual([
      { from: "2026-01-05", target: 4 },
    ]);
  });

  it("та сама ціль після останнього запису нічого не додає", () => {
    const history = [{ from: "2026-01-01", target: 4 }];
    expect(appendWeeklyTargetInterval(history, "2026-02-01", 4)).toEqual(
      history,
    );
  });

  it("перезаписує запис із тією самою датою", () => {
    const history = [
      { from: "2026-01-01", target: 2 },
      { from: "2026-02-01", target: 4 },
    ];
    expect(appendWeeklyTargetInterval(history, "2026-02-01", 6)).toEqual([
      { from: "2026-01-01", target: 2 },
      { from: "2026-02-01", target: 6 },
    ]);
  });

  it("нормалізує ціль поза діапазоном", () => {
    expect(appendWeeklyTargetInterval([], "2026-01-05", 99)).toEqual([
      { from: "2026-01-05", target: 7 },
    ]);
  });
});

describe("межі тижня", () => {
  it("понеділок і неділя ISO-тижня", () => {
    expect(weekStartKeyForDateKey("2026-01-07")).toBe("2026-01-05");
    expect(weekEndKeyForDateKey("2026-01-07")).toBe("2026-01-11");
  });
});

describe("isFlexibleHabit", () => {
  it("порожній recurrence вважається daily", () => {
    expect(isFlexibleHabit({ recurrence: "flexible" })).toBe(true);
    expect(isFlexibleHabit({ recurrence: undefined })).toBe(false);
  });
});

describe("dateKeyWithinHabitBounds", () => {
  it("архівна звичка поза межами завжди", () => {
    expect(
      dateKeyWithinHabitBounds(habit({ archived: true }), "2026-01-07"),
    ).toBe(false);
  });

  it("без startDate межа береться з createdAt", () => {
    const h = habit({
      startDate: undefined,
      createdAt: "2026-01-10T08:00:00Z",
    });
    expect(dateKeyWithinHabitBounds(h, "2026-01-09")).toBe(false);
    expect(dateKeyWithinHabitBounds(h, "2026-01-10")).toBe(true);
  });

  it("endDate включний", () => {
    const h = habit({ endDate: "2026-01-20" });
    expect(dateKeyWithinHabitBounds(h, "2026-01-20")).toBe(true);
    expect(dateKeyWithinHabitBounds(h, "2026-01-21")).toBe(false);
  });
});

describe("weekDoneCountExcludingDate", () => {
  it("рахує тиждень без самого дня і без чужих дат", () => {
    const done = [
      "2026-01-05",
      "2026-01-07",
      "2026-01-08",
      "2026-01-12",
      "сміття",
    ];
    expect(weekDoneCountExcludingDate(done, "2026-01-07")).toBe(2);
  });

  it("не-масив дає нуль", () => {
    expect(weekDoneCountExcludingDate(undefined, "2026-01-07")).toBe(0);
  });
});

describe("flexibleHabitAvailableOnDate", () => {
  it("поза межами звички недоступна", () => {
    expect(
      flexibleHabitAvailableOnDate(
        habit({ endDate: "2026-01-06" }),
        "2026-01-07",
      ),
    ).toBe(false);
  });

  it("датований інтервал паузи ховає день, поза ним звичка доступна", () => {
    const h = habit({
      pauseIntervals: [{ from: "2026-01-06", to: "2026-01-08" }],
    });
    expect(flexibleHabitAvailableOnDate(h, "2026-01-05")).toBe(true);
    expect(flexibleHabitAvailableOnDate(h, "2026-01-07")).toBe(false);
    expect(flexibleHabitAvailableOnDate(h, "2026-01-09")).toBe(true);
  });

  it("відкритий інтервал ховає все з дати початку", () => {
    const h = habit({ pauseIntervals: [{ from: "2026-01-06", to: null }] });
    expect(flexibleHabitAvailableOnDate(h, "2026-01-05")).toBe(true);
    expect(flexibleHabitAvailableOnDate(h, "2030-01-01")).toBe(false);
  });

  it("легасі-прапор paused: без pausedFrom ховає день, з ним — лише від дати паузи", () => {
    const h = habit({ paused: true });
    expect(flexibleHabitAvailableOnDate(h, "2026-01-07")).toBe(false);
    expect(flexibleHabitAvailableOnDate(h, "2026-01-07", "2026-01-08")).toBe(
      true,
    );
    expect(flexibleHabitAvailableOnDate(h, "2026-01-09", "2026-01-08")).toBe(
      false,
    );
  });
});

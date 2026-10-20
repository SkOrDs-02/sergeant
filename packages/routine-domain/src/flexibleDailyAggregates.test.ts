/**
 * Аудит 2026-10-01, logic-11: гнучкі звички («N разів на тиждень») не мають
 * потрапляти у ДЕННІ агрегати Рутини (хаб-серія, кільце дня, рядки статистики).
 * Рішення власника 2026-10-19 (варіант A), `METRICS_VERSION` 18.
 */
import { describe, expect, it } from "vitest";

import { calcRoutineDayProgress } from "./dayProgress.js";
import {
  flexibleMaxActiveStreak,
  flexibleMaxStreakAllTimeAcrossHabits,
} from "./flexStreak.js";
import { buildHabitRangeRows } from "./habitRangeRows.js";
import { computeRoutineQuickStats } from "./quickStats.js";
import { completionRateForRange } from "./streaks.js";
import type { Habit, HabitSkip } from "./types.js";
import { weeklyGoalStreakWeeks } from "./weeklyGoalStreak.js";

function flex(id: string, startDate: string, target = 3): Habit {
  return {
    id,
    name: id,
    recurrence: "flexible",
    startDate,
    weeklyTargetHistory: [{ from: startDate, target }],
  };
}

function daily(id: string, startDate = "2026-08-01"): Habit {
  return { id, name: id, recurrence: "daily", startDate };
}

// Пн/Ср/Пт чотирьох повних тижнів (24.08, 31.08, 07.09, 14.09).
const FOUR_WEEKS_MWF = [
  "2026-08-24",
  "2026-08-26",
  "2026-08-28",
  "2026-08-31",
  "2026-09-02",
  "2026-09-04",
  "2026-09-07",
  "2026-09-09",
  "2026-09-11",
  "2026-09-14",
  "2026-09-16",
  "2026-09-18",
];

describe("хаб-серія не рахує гнучкі звички поденно (logic-11)", () => {
  it("ціль 3/тиждень, 4 повні тижні Пн/Ср/Пт, цього тижня лише Пн, сьогодні Чт: серія не вигадується по днях, тижнева лишається 4", () => {
    const h = flex("f", "2026-08-24");
    const done = [...FOUR_WEEKS_MWF, "2026-09-21"];
    expect(weeklyGoalStreakWeeks(h, done, "2026-09-24")).toBe(4);
    expect(flexibleMaxActiveStreak([h], { f: done }, "2026-09-24")).toBe(0);
  });

  it("у неділю з добраною ціллю гнучка звичка не дає «12 днів» і не перебиває денну звичку", () => {
    const f = flex("f", "2026-08-24");
    const d = daily("d");
    const done = [...FOUR_WEEKS_MWF, "2026-09-21", "2026-09-23", "2026-09-25"];
    const streak = flexibleMaxActiveStreak(
      [f, d],
      { f: done, d: ["2026-09-26", "2026-09-27"] },
      "2026-09-27",
    );
    // Лише `daily` (2 дні поспіль); без виключення гнучка звичка давала 12.
    expect(streak).toBe(2);
  });

  it("звичка 1×/тиждень, 6 понеділків поспіль: денна серія не 6", () => {
    const h = flex("w", "2026-08-17", 1);
    const done = [
      "2026-08-17",
      "2026-08-24",
      "2026-08-31",
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
    ];
    expect(weeklyGoalStreakWeeks(h, done, "2026-09-21")).toBe(6);
    expect(flexibleMaxActiveStreak([h], { w: done }, "2026-09-21")).toBe(0);
    expect(
      computeRoutineQuickStats([h], { w: done }, "2026-09-21").streak,
    ).toBe(0);
  });

  it("«Макс. серія» за весь час теж без гнучких звичок (одна одиниця з «Серія сьогодні»)", () => {
    const f = flex("f", "2026-08-24");
    const d = daily("d");
    expect(
      flexibleMaxStreakAllTimeAcrossHabits([f, d], {
        f: [...FOUR_WEEKS_MWF],
        d: ["2026-09-01", "2026-09-02"],
      }),
    ).toBe(2);
  });
});

describe("buildHabitRangeRows: гнучка звичка рахується цільовою арифметикою (logic-11)", () => {
  // Сценарій аудиту: Flex 3 з 14.09, відмічено 14, 15, 16, 21, 22; сьогодні сб 26.09.
  const habit = flex("f", "2026-09-14");
  const done = [
    "2026-09-14",
    "2026-09-15",
    "2026-09-16",
    "2026-09-21",
    "2026-09-22",
  ];
  const today = new Date(2026, 8, 26, 12, 0, 0, 0);

  it("вікно 30 днів дає 5/6, а не 5/9, і збігається зі «Зведенням»", () => {
    const [row] = buildHabitRangeRows([habit], { f: done }, today, 30);
    expect(row).toMatchObject({ completed: 5, scheduled: 6 });
    const summary = completionRateForRange(
      [habit],
      { f: done },
      "2026-08-28",
      "2026-09-26",
    );
    expect(row?.scheduled).toBe(summary.scheduled);
    expect(row?.completed).toBe(summary.completed);
  });

  it("дні тижня, що триває, поки ціль досяжна, не «не виконано»", () => {
    const [row] = buildHabitRangeRows([habit], { f: done }, today, 30);
    const byKey = new Map(row?.cells.map((c) => [c.dateKey, c.state]));
    expect(byKey.get("2026-09-23")).toBe("unscheduled");
    expect(byKey.get("2026-09-26")).toBe("unscheduled");
    expect(byKey.get("2026-09-21")).toBe("done");
    // Закритий тиждень 14–20 з добраною ціллю: дні понад норму теж не провал.
    expect(byKey.get("2026-09-18")).toBe("unscheduled");
  });

  it("коли ціль тижня, що триває, вже недосяжна, невідмічені дні — «не виконано»", () => {
    // Сб 26.09, у тижні 21–27 відмічено 0: лишається сьогодні + нд = 2 < 3.
    const [row] = buildHabitRangeRows([habit], { f: [] }, today, 7);
    const byKey = new Map(row?.cells.map((c) => [c.dateKey, c.state]));
    expect(byKey.get("2026-09-21")).toBe("missed");
    expect(byKey.get("2026-09-26")).toBe("missed");
  });

  it("закритий тиждень без добраної цілі — «не виконано» на невідмічених днях", () => {
    const [row] = buildHabitRangeRows(
      [habit],
      { f: ["2026-09-14"] },
      today,
      14,
    );
    const byKey = new Map(row?.cells.map((c) => [c.dateKey, c.state]));
    expect(byKey.get("2026-09-14")).toBe("done");
    expect(byKey.get("2026-09-15")).toBe("missed");
  });
});

describe("calcRoutineDayProgress: добрана тижнева ціль не в знаменнику кільця (logic-11)", () => {
  const f = flex("f", "2026-09-14");
  const g = daily("g", "2026-09-01");
  const s: Habit = {
    id: "s",
    name: "MWF S",
    recurrence: "weekly",
    weekdays: [0, 2, 4],
    startDate: "2026-09-01",
  };
  const completions = {
    f: ["2026-09-14", "2026-09-15", "2026-09-16"],
    g: ["2026-09-18"],
    s: ["2026-09-18"],
  };

  it("18.09: Flex 3 добрано, Daily G і MWF S відмічено → 2 з 2", () => {
    const p = calcRoutineDayProgress(
      [f, g, s],
      completions,
      "2026-09-18",
      "2026-09-18",
    );
    expect(p).toMatchObject({ completed: 2, scheduled: 2, rate: 1 });
  });

  it("гнучка звичка з недобраною ціллю рахується запланованою; відмічена — виконаною", () => {
    // 17.09: у тижні вже 3 відмітки → не в розкладі.
    expect(
      calcRoutineDayProgress([f], completions, "2026-09-17", "2026-09-17"),
    ).toMatchObject({ completed: 0, scheduled: 0 });
    // 16.09: сам день виключається з лічильника, тож 2 < 3 — це «1 з 1».
    expect(
      calcRoutineDayProgress([f], completions, "2026-09-16", "2026-09-16"),
    ).toMatchObject({ completed: 1, scheduled: 1 });
    // Невідмічений день тижня без добраної цілі — запланований.
    expect(
      calcRoutineDayProgress(
        [f],
        { f: ["2026-09-14"] },
        "2026-09-17",
        "2026-09-17",
      ),
    ).toMatchObject({ completed: 0, scheduled: 1 });
  });

  it("«не зміг» виходить зі знаменника і для гнучкої звички", () => {
    const skip: HabitSkip = { reason: "sick", at: "2026-09-17T10:00:00.000Z" };
    expect(
      calcRoutineDayProgress(
        [f],
        { f: ["2026-09-14"] },
        "2026-09-17",
        "2026-09-17",
        { f: { "2026-09-17": skip } },
      ),
    ).toMatchObject({ completed: 0, scheduled: 0 });
  });

  it("лічильник хабу (todayDone/todayTotal) збігається з кільцем модуля", () => {
    const q = computeRoutineQuickStats([f, g, s], completions, "2026-09-18");
    expect(q).toMatchObject({ todayDone: 2, todayTotal: 2 });
  });
});

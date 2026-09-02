/**
 * Видимість гнучкої звички «N разів на тиждень» — лічильник тижня і гейт
 * календаря.
 *
 * AI-CONTEXT: тут перевіряється рівно те, чого не міг перевірити жоден
 * наявний тест: `weekDoneCountExcludingDate` виключає САМ день, і саме це
 * робить один лічильник придатним і для «показати сьогодні», і для
 * «показати минулий день». З простим лічильником тижня закритий тиждень
 * 3/3 стер би з календаря всі три відмітки — тобто фіча ховала б власні
 * результати.
 */
import { describe, expect, it } from "vitest";

import { buildHubCalendarEvents } from "./calendarEvents.js";
import { weekDoneCountExcludingDate } from "./weeklyTarget.js";
import type { Habit, RoutineState } from "./types.js";

// 2026-01-05 — понеділок; тиждень 05…11 січня.
const MON = "2026-01-05";
const TUE = "2026-01-06";
const WED = "2026-01-07";
const THU = "2026-01-08";
const NEXT_MON = "2026-01-12";

function flexHabit(target: number): Habit {
  return {
    id: "h1",
    name: "Спорт",
    emoji: "check",
    archived: false,
    recurrence: "flexible",
    startDate: "2026-01-01",
    endDate: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    weeklyTargetHistory: [{ from: "2026-01-01", target }],
  } as Habit;
}

function stateWith(habit: Habit, done: string[]): RoutineState {
  return {
    schemaVersion: 3,
    prefs: {
      showFizrukInCalendar: false,
      showFinykSubscriptionsInCalendar: false,
      routineRemindersEnabled: false,
    },
    tags: [],
    categories: [],
    habits: [habit],
    completions: { [habit.id]: done },
    habitOrder: [],
    completionNotes: {},
  } as RoutineState;
}

function habitDates(state: RoutineState, from: string, to: string): string[] {
  return buildHubCalendarEvents(
    state,
    { startKey: from, endKey: to },
    { showFizruk: false, showFinykSubs: false },
    {},
  )
    .filter((e) => e.sourceKind === "habit")
    .map((e) => e.date);
}

describe("weekDoneCountExcludingDate", () => {
  it("не рахує сам день", () => {
    expect(weekDoneCountExcludingDate([MON, TUE], MON)).toBe(1);
    expect(weekDoneCountExcludingDate([MON, TUE], WED)).toBe(2);
  });

  it("не заглядає в сусідні тижні", () => {
    expect(weekDoneCountExcludingDate([MON, NEXT_MON], WED)).toBe(1);
    expect(weekDoneCountExcludingDate([MON, NEXT_MON], NEXT_MON)).toBe(0);
  });

  it("ігнорує сміття у списку відміток", () => {
    expect(
      weekDoneCountExcludingDate(
        [MON, "не дата", "", "2026-13-99"] as string[],
        WED,
      ),
    ).toBe(1);
  });
});

describe("гнучка звичка в календарі", () => {
  it("тримається в списку, доки тиждень не добрано", () => {
    const s = stateWith(flexHabit(3), [MON, TUE]);
    // Дві відмітки з трьох — середа ще потрібна.
    expect(habitDates(s, WED, WED)).toEqual([WED]);
  });

  it("зникає з майбутніх днів, щойно ціль закрито", () => {
    const s = stateWith(flexHabit(3), [MON, TUE, WED]);
    expect(habitDates(s, THU, THU)).toEqual([]);
  });

  it("НЕ стирає дні, у які її виконали, коли тиждень закрито", () => {
    // Це і є пастка, заради якої лічильник виключає сам день: без цього
    // закритий тиждень 3/3 сховав би всі три відмітки.
    const s = stateWith(flexHabit(3), [MON, TUE, WED]);
    expect(habitDates(s, MON, WED)).toEqual([MON, TUE, WED]);
  });

  it("новий тиждень починається з чистого лічильника", () => {
    const s = stateWith(flexHabit(3), [MON, TUE, WED]);
    expect(habitDates(s, NEXT_MON, NEXT_MON)).toEqual([NEXT_MON]);
  });

  it("ціль читається на дату, а не остання відома", () => {
    const habit = {
      ...flexHabit(3),
      weeklyTargetHistory: [
        { from: "2026-01-01", target: 2 },
        { from: NEXT_MON, target: 5 },
      ],
    } as Habit;
    // Перший тиждень мав ціль 2, тож після двох відміток середа вільна.
    expect(habitDates(stateWith(habit, [MON, TUE]), WED, WED)).toEqual([]);
  });
});

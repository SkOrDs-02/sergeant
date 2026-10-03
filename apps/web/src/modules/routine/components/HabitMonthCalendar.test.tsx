/** @vitest-environment jsdom */
/**
 * PR-R4 follow-up (аудит 2026-09-13, coordinator доробка): `HabitMonthCalendar`
 * — п'ятий call-site того самого класу («гнучка звичка, яка добрала тижневу
 * ціль, не має виглядати запланованою»), знайдений грепом поза початковими
 * трьома, названими аудитом. Закритий тим самим шляхом —
 * `weekDoneCountExcludingDate` + `isFlexibleHabit` перед
 * `habitScheduledOnDate`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { HabitMonthCalendar } from "./HabitMonthCalendar";
import type { Habit } from "../lib/types";

// "Сьогодні" = 2026-06-04 (четвер), той самий тиждень Пн 2026-06-01..Нд
// 2026-06-07, що й у `useRoutineDerivedData.test.ts` — узгоджені фікстури.
const FIXED_NOW = new Date("2026-06-04T09:00:00Z");

function flexHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    name: "Спорт",
    recurrence: "flexible",
    archived: false,
    tagIds: [],
    categoryId: null,
    reminderTimes: [],
    weekdays: [],
    startDate: "2026-05-01",
    ...overrides,
  } as Habit;
}

describe("HabitMonthCalendar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("flexible habit: тижневу ціль уже добрано → сьогоднішня клітинка НЕ показує «заплановано»", () => {
    const { container } = render(
      <HabitMonthCalendar
        habit={flexHabit()}
        // Три відмітки пн/вт/ср добирають дефолтну ціль (3) до сьогодні
        // (2026-06-04, чт).
        completions={["2026-06-01", "2026-06-02", "2026-06-03"]}
        todayKey="2026-06-04"
      />,
    );
    const cell = container.querySelector('[title="2026-06-04"]');
    expect(cell).not.toBeNull();
    expect(
      container.querySelector('[title="2026-06-04: заплановано"]'),
    ).toBeNull();
  });

  /**
   * Guard проти надто агресивного фіксу вище: гнучка звичка, що ЩЕ не
   * добрала тижневу ціль, і далі показується як запланована.
   */
  it("flexible habit: тижневу ціль ще НЕ добрано → клітинка лишається «заплановано», як раніше", () => {
    const { container } = render(
      <HabitMonthCalendar
        habit={flexHabit()}
        completions={["2026-06-01"]} // 1 з 3 цього тижня
        todayKey="2026-06-04"
      />,
    );
    expect(
      container.querySelector('[title="2026-06-04: заплановано"]'),
    ).not.toBeNull();
  });

  it("daily habit is unaffected: still scheduled on today regardless of week completions", () => {
    const { container } = render(
      <HabitMonthCalendar
        habit={flexHabit({ recurrence: "daily" })}
        completions={["2026-06-01", "2026-06-02", "2026-06-03"]}
        todayKey="2026-06-04"
      />,
    );
    expect(
      container.querySelector('[title="2026-06-04: заплановано"]'),
    ).not.toBeNull();
  });
});

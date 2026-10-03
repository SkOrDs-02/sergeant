import { describe, expect, it } from "vitest";

import { collapseReminders, compromiseTime, planSends } from "./budget.js";
import type { DueReminder } from "./due.js";

function reason(over: Partial<DueReminder> = {}): DueReminder {
  return {
    userId: "u1",
    module: "routine",
    dedupKey: "routine_notify_hab_1_08:00_2026-08-03",
    title: "Зарядка",
    body: "Нагадування про звичку",
    url: "/?module=routine",
    at: "08:00",
    label: "Зарядка",
    ...over,
  };
}

describe("planSends", () => {
  it("у межах стелі кожен час лишається власною відправкою", () => {
    expect(planSends(["08:00", "19:00"], 2)).toEqual([
      { sendAt: "08:00", times: ["08:00"] },
      { sendAt: "19:00", times: ["19:00"] },
    ]);
  });

  it("стеля 0 не дає жодної відправки", () => {
    expect(planSends(["08:00", "12:00"], 0)).toEqual([]);
  });

  it("однакові часи рахуються як один", () => {
    expect(planSends(["08:00", "08:00"], 1)).toEqual([
      { sendAt: "08:00", times: ["08:00"] },
    ]);
  });

  it("понад стелю ріже по найбільшому проміжку: ранок окремо від вечора", () => {
    expect(planSends(["08:00", "09:00", "19:00", "20:00"], 2)).toEqual([
      { sendAt: "08:30", times: ["08:00", "09:00"] },
      { sendAt: "19:30", times: ["19:00", "20:00"] },
    ]);
  });

  it("стеля 1 згортає весь день в одну відправку посередині", () => {
    expect(planSends(["08:00", "19:00"], 1)).toEqual([
      { sendAt: "13:30", times: ["08:00", "19:00"] },
    ]);
  });

  it("не залежить від порядку вхідних часів", () => {
    expect(planSends(["19:00", "08:00", "12:00"], 2)).toEqual(
      planSends(["08:00", "12:00", "19:00"], 2),
    );
  });
});

describe("compromiseTime", () => {
  it("бере середину між першим і останнім", () => {
    expect(compromiseTime(["08:00", "12:00"])).toBe("10:00");
  });

  it("не кладе середину, обрану продуктом, у тихі години", () => {
    // Середина 07:00 і 08:30 це 07:45, тобто ще ніч; тоді беремо
    // найближчий власний час людини поза вікном.
    expect(compromiseTime(["07:00", "08:30"])).toBe("08:30");
  });

  it("лишає нічний час, якщо людина сама поставила все в ніч", () => {
    expect(compromiseTime(["06:00", "07:00"])).toBe("06:00");
  });
});

describe("collapseReminders", () => {
  it("один привід їде як є, з тим самим tag, що й клієнтський таймер", () => {
    const only = reason();
    expect(collapseReminders([only], "2026-08-03", "08:00")).toEqual({
      title: only.title,
      body: only.body,
      tag: only.dedupKey,
      url: only.url,
      module: "routine",
    });
  });

  it("кілька приводів перелічує в одному сповіщенні", () => {
    const pushed = collapseReminders(
      [
        reason(),
        reason({ module: "fizruk", label: "тренування", at: "19:00" }),
      ],
      "2026-08-03",
      "13:30",
    );
    expect(pushed).toEqual({
      title: "Нагадування",
      body: "Сьогодні: Зарядка, тренування.",
      tag: "reminders-2026-08-03-13:30",
      url: "/",
      module: "reminders",
    });
  });

  it("мінімальна приватність не світить назв і не дублює підпис", () => {
    const pushed = collapseReminders(
      [reason({ label: "звичка" }), reason({ label: "звичка", at: "09:00" })],
      "2026-08-03",
      "08:30",
    );
    expect(pushed.body).toBe("Сьогодні: звичка.");
  });
});

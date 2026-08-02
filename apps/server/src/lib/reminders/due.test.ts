import { describe, expect, it } from "vitest";

import { fizrukDueNow, nutritionDueNow, routineDueNow } from "./due.js";
import type { RoutineHabitRow } from "./due.js";

const DAY = "2026-08-03"; // понеділок
const NO_IDS: ReadonlySet<string> = new Set();

function habitRow(
  overrides: Partial<RoutineHabitRow["habit"]> = {},
): RoutineHabitRow {
  return {
    userId: "u1",
    privacyMinimal: false,
    habit: {
      id: "hab_1",
      name: "Зарядка",
      emoji: "🏃",
      recurrence: "daily",
      startDate: "2026-01-01",
      reminderTimes: ["08:00"],
      ...overrides,
    },
  };
}

function routine(rows: RoutineHabitRow[], hm = "08:00", extra = {}) {
  return routineDueNow({
    rows,
    dayKey: DAY,
    hm,
    completedHabitIds: NO_IDS,
    skippedHabitIds: NO_IDS,
    ...extra,
  });
}

describe("routineDueNow", () => {
  it("шле нагадування у заявлену хвилину", () => {
    const due = routine([habitRow()]);
    expect(due).toHaveLength(1);
    expect(due[0]?.title).toBe("🏃 Зарядка");
    expect(due[0]?.module).toBe("routine");
  });

  it("мовчить у будь-яку іншу хвилину", () => {
    expect(routine([habitRow()], "08:01")).toHaveLength(0);
  });

  it("дедуп-ключ збігається з тим, який клієнт ставить у Notification.tag", () => {
    // Це і є механізм, що не дає задублювати банер, коли локальний таймер
    // відкритої вкладки і серверний пуш спрацюють на одну хвилину.
    const due = routine([habitRow()]);
    expect(due[0]?.dedupKey).toBe("routine_notify_hab_1_08:00_2026-08-03");
  });

  it("не нагадує про вже виконану сьогодні звичку", () => {
    const due = routine([habitRow()], "08:00", {
      completedHabitIds: new Set(["hab_1"]),
    });
    expect(due).toHaveLength(0);
  });

  it("не сперечається з людиною, яка вже поставила «не зміг»", () => {
    const due = routine([habitRow()], "08:00", {
      skippedHabitIds: new Set(["hab_1"]),
    });
    expect(due).toHaveLength(0);
  });

  it("поважає датований інтервал паузи", () => {
    const due = routine([
      habitRow({ pauseIntervals: [{ from: "2026-08-01", to: "2026-08-10" }] }),
    ]);
    expect(due).toHaveLength(0);
  });

  it("не шле у день, коли звичка не запланована розкладом", () => {
    // weekly, лише неділя (ISO-індекс 6) — а DAY це понеділок.
    const due = routine([habitRow({ recurrence: "weekly", weekdays: [6] })]);
    expect(due).toHaveLength(0);
  });

  it("приховує назву звички у мінімальному режимі приватності", () => {
    // page-audit-09 F9: перенесення нагадувань на сервер не має права
    // обійти явну відмову показувати назву на локскріні.
    const row = habitRow();
    const due = routine([{ ...row, privacyMinimal: true }]);
    expect(due[0]?.title).toBe("Нагадування");
    expect(JSON.stringify(due[0])).not.toContain("Зарядка");
  });

  it("розуміє легасі-поле timeOfDay, коли reminderTimes порожній", () => {
    const due = routine([habitRow({ reminderTimes: [], timeOfDay: "08:00" })]);
    expect(due).toHaveLength(1);
  });

  it("не змішує звички різних користувачів в одному наборі", () => {
    const a = habitRow();
    const b: RoutineHabitRow = {
      ...habitRow({ id: "hab_2", name: "Читання" }),
      userId: "u2",
    };
    const due = routine([a, b]);
    expect(due.map((d) => d.userId)).toEqual(["u1", "u2"]);
  });
});

describe("fizrukDueNow", () => {
  const base = {
    userId: "u1",
    reminderEnabled: true,
    reminderHour: 18,
    reminderMinute: 0,
    hasWorkoutToday: true,
  };

  it("шле, коли на сьогодні є тренування", () => {
    const due = fizrukDueNow([base], DAY, "18:00");
    expect(due).toHaveLength(1);
    expect(due[0]?.dedupKey).toBe("fizruk_notify_2026-08-03");
  });

  it("мовчить, коли тренування на сьогодні не призначено", () => {
    expect(
      fizrukDueNow([{ ...base, hasWorkoutToday: false }], DAY, "18:00"),
    ).toHaveLength(0);
  });

  it("поважає вимкнений перемикач", () => {
    expect(
      fizrukDueNow([{ ...base, reminderEnabled: false }], DAY, "18:00"),
    ).toHaveLength(0);
  });

  it("враховує хвилини, а не лише годину", () => {
    const row = { ...base, reminderHour: 19, reminderMinute: 30 };
    expect(fizrukDueNow([row], DAY, "19:00")).toHaveLength(0);
    expect(fizrukDueNow([row], DAY, "19:30")).toHaveLength(1);
  });
});

describe("nutritionDueNow", () => {
  const base = { userId: "u1", reminderEnabled: true, reminderHour: 12 };

  it("шле рівно о вибраній годині", () => {
    expect(nutritionDueNow([base], DAY, "12:00")).toHaveLength(1);
    expect(nutritionDueNow([base], DAY, "12:30")).toHaveLength(0);
  });

  it("поважає вимкнений перемикач", () => {
    expect(
      nutritionDueNow([{ ...base, reminderEnabled: false }], DAY, "12:00"),
    ).toHaveLength(0);
  });
});

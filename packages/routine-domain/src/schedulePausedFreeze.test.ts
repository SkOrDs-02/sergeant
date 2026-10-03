import { describe, it, expect } from "vitest";

import { habitScheduledOnDate } from "./schedule.js";
import { buildHeatmapGrid } from "./domain/heatmap/grid.js";
import { completionRateForRange } from "./streaks.js";
import type { Habit } from "./types.js";

/**
 * Заморозка минулого для `paused` — ADR-0079 §3.
 *
 * ADR обіцяє: «пауза, поставлена сьогодні, не вимиває звичку з минулорічного
 * heatmap». Донедавна реалізації цієї обіцянки не було: `paused` — недатований
 * булеан, і предикат відсіював за ним УСІ дати, включно з торішніми.
 *
 * Тест фіксує обидві гілки — і історичну (дефолт), і заморожену (`pausedFrom`).
 */

const habit: Habit = {
  id: "h1",
  name: "Зарядка",
  recurrence: "daily",
  startDate: "2025-01-01",
  paused: true,
} as Habit;

describe("habitScheduledOnDate · paused", () => {
  it("БЕЗ pausedFrom пауза ретроактивна — історична поведінка збережена", () => {
    // Дефолт навмисно не змінено: перемикання рухає число, яке користувач
    // уже бачив, і потребує `metricsVersion`.
    expect(habitScheduledOnDate(habit, "2025-03-15")).toBe(false);
    expect(habitScheduledOnDate(habit, "2026-07-30")).toBe(false);
  });

  it("З pausedFrom минуле лишається запланованим", () => {
    const today = "2026-07-30";
    // Ось та сама торішня дата — і вона більше не вимивається.
    expect(
      habitScheduledOnDate(habit, "2025-03-15", { pausedFrom: today }),
    ).toBe(true);
    expect(
      habitScheduledOnDate(habit, "2026-07-29", { pausedFrom: today }),
    ).toBe(true);
  });

  it("З pausedFrom сьогодні й майбутнє НЕ заплановані", () => {
    const today = "2026-07-30";
    expect(habitScheduledOnDate(habit, today, { pausedFrom: today })).toBe(
      false,
    );
    expect(
      habitScheduledOnDate(habit, "2026-08-01", { pausedFrom: today }),
    ).toBe(false);
  });

  it("archived лишається ретроактивним і з pausedFrom", () => {
    // `archived` — окреме рішення: ADR його не згадує, а `activeHabits`
    // фільтрує архівні ще до побудови сітки. Свідомо не чіпаємо.
    const archived = { ...habit, paused: false, archived: true } as Habit;
    expect(
      habitScheduledOnDate(archived, "2025-03-15", {
        pausedFrom: "2026-07-30",
      }),
    ).toBe(false);
  });

  it("не-пауза не залежить від pausedFrom", () => {
    const active = { ...habit, paused: false } as Habit;
    expect(habitScheduledOnDate(active, "2025-03-15")).toBe(true);
    expect(
      habitScheduledOnDate(active, "2025-03-15", { pausedFrom: "2026-07-30" }),
    ).toBe(true);
  });
});

describe("completionRateForRange · pausedFrom", () => {
  // Rate — друга половина тієї ж обіцянки ADR-0079: §1 прямо називає
  // «пауза звички переписує rate/heatmap за минуле» серед проявів вади.
  // Heatmap заморозили раніше, rate — тут.
  const pausedHabit: Habit = {
    id: "h1",
    name: "Зарядка",
    recurrence: "daily",
    startDate: "2026-07-01",
    paused: true,
  } as Habit;
  const completions = { h1: ["2026-07-20", "2026-07-21"] };

  it("БЕЗ pausedFrom пауза обнуляє минулий діапазон", () => {
    const r = completionRateForRange(
      [pausedHabit],
      completions,
      "2026-07-15",
      "2026-07-25",
    );
    // Знаменник порожній — виконані дні просто зникли зі статистики.
    expect(r).toEqual({ completed: 0, scheduled: 0, rate: 0 });
  });

  it("З pausedFrom минулий діапазон лишається порахованим", () => {
    const r = completionRateForRange(
      [pausedHabit],
      completions,
      "2026-07-15",
      "2026-07-25",
      { pausedFrom: "2026-07-30" },
    );
    // 11 днів у діапазоні, дві відмітки — і жодна з них більше не губиться
    // від того, що сьогодні натиснули «пауза».
    expect(r.scheduled).toBe(11);
    expect(r.completed).toBe(2);
  });

  it("З pausedFrom діапазон із сьогодні й далі лишається порожнім", () => {
    const r = completionRateForRange(
      [pausedHabit],
      completions,
      "2026-07-30",
      "2026-08-05",
      { pausedFrom: "2026-07-30" },
    );
    expect(r.scheduled).toBe(0);
  });
});

describe("buildHeatmapGrid · freezePausedPast", () => {
  // Доказ на рівні сітки, а не лише предиката: саме тут ADR-обіцянка
  // або виконується, або ні.
  const today = new Date("2026-07-30T12:00:00");
  const pausedHabit: Habit = {
    id: "h1",
    name: "Зарядка",
    recurrence: "daily",
    startDate: "2026-07-01",
    paused: true,
  } as Habit;
  const completions = { h1: ["2026-07-20", "2026-07-21"] };

  it("БЕЗ freeze пауза стирає минуле зі знаменника", () => {
    const grid = buildHeatmapGrid([pausedHabit], completions, today, 8, {
      denominator: "scheduled",
    });
    const past = grid.weeks
      .flat()
      .filter((c) => c.dateKey < "2026-07-30" && c.dateKey >= "2026-07-01");
    // Жодного запланованого дня в минулому — звичка вимита з історії.
    expect(past.every((c) => c.scheduledTotal === 0)).toBe(true);
  });

  it("З freeze минуле лишається у знаменнику, майбутнє — ні", () => {
    const grid = buildHeatmapGrid([pausedHabit], completions, today, 8, {
      denominator: "scheduled",
      freezePausedPast: true,
    });
    const cells = grid.weeks.flat();
    const past = cells.filter(
      (c) => c.dateKey < "2026-07-30" && c.dateKey >= "2026-07-01",
    );
    expect(past.length).toBeGreaterThan(0);
    expect(past.every((c) => c.scheduledTotal === 1)).toBe(true);

    // А сьогодні й далі пауза діє — це і є «від сьогодні вперед».
    const todayCell = cells.find((c) => c.dateKey === "2026-07-30");
    expect(todayCell?.scheduledTotal).toBe(0);
  });
});

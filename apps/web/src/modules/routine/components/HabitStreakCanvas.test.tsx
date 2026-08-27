/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HabitStreakCanvas } from "./HabitStreakCanvas";
import type { Habit } from "../lib/types";
import type { HabitSkip } from "@sergeant/routine-domain";

afterEach(cleanup);

const TODAY = "2026-08-02"; // Sunday

function weekdaysHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    name: "Ранкова зарядка",
    recurrence: "weekdays",
    startDate: "2026-07-01",
    ...overrides,
  };
}

/**
 * Фікстура, що навмисно проганяє одне вікно крізь усі пʼять станів +
 * "pending" одночасно, без обриву серії (див. еквівалентний доменний тест
 * у `packages/routine-domain/src/flexStreak.test.ts` для викладки логіки):
 *
 *   07-20 Пн done · 07-21 Вт done · 07-22 Ср pause · 07-23 Чт done ·
 *   07-24 Пт skip(busy) · 07-25/26 Сб/Нд off · 07-27 Пн done ·
 *   07-28 Вт miss (мовчазний, прощений) · 07-29..31 done ·
 *   08-01 Сб off · 08-02 Нд (TODAY) off.
 */
const COMPLETIONS = [
  "2026-07-20",
  "2026-07-21",
  "2026-07-23",
  "2026-07-27",
  "2026-07-29",
  "2026-07-30",
  "2026-07-31",
];
const SKIPS: Record<string, HabitSkip> = {
  "2026-07-24": { reason: "busy", at: "2026-07-24T09:00:00.000Z" },
};
const HABIT = weekdaysHabit({
  pauseIntervals: [{ from: "2026-07-22", to: "2026-07-22" }],
});

describe("HabitStreakCanvas", () => {
  it("рендерить клітинку «виконано» суцільним філом з датою в aria-label", () => {
    render(
      <HabitStreakCanvas
        habit={HABIT}
        completions={COMPLETIONS}
        skips={SKIPS}
        todayKey={TODAY}
      />,
    );
    expect(screen.getByLabelText("20 лип.: виконано")).toBeInTheDocument();
  });

  it("рендерить «не зміг» як контур і озвучує причину пропуску", () => {
    render(
      <HabitStreakCanvas
        habit={HABIT}
        completions={COMPLETIONS}
        skips={SKIPS}
        todayKey={TODAY}
      />,
    );
    const cell = screen.getByLabelText("24 лип.: не зміг, Не було часу");
    expect(cell).toBeInTheDocument();
    // Контур, не філ: без bg-routine/bg-transparent з border.
    expect(cell.className).toContain("border-2");
    expect(cell.className).toContain("bg-transparent");
  });

  it("рендерить мовчазний пропуск, прощений заморозкою, як half-fill", () => {
    render(
      <HabitStreakCanvas
        habit={HABIT}
        completions={COMPLETIONS}
        skips={SKIPS}
        todayKey={TODAY}
      />,
    );
    const cell = screen.getByLabelText(
      "28 лип.: мовчазний пропуск, прощений заморозкою",
    );
    expect(cell).toBeInTheDocument();
    // Half-fill markup: внутрішній absolute-шар на нижній половині.
    expect(cell.querySelector(".h-1\\/2")).not.toBeNull();
  });

  it("рендерить плановану паузу штрихуванням, не акцентом модуля", () => {
    render(
      <HabitStreakCanvas
        habit={HABIT}
        completions={COMPLETIONS}
        skips={SKIPS}
        todayKey={TODAY}
      />,
    );
    const cell = screen.getByLabelText("22 лип.: планована пауза");
    expect(cell).toBeInTheDocument();
    // Нейтральний (line), не акцентний (routine) — день "не існує" для серії.
    expect(cell.className).not.toContain("routine");
    expect(
      cell.querySelector('[style*="repeating-linear-gradient"]'),
    ).not.toBeNull();
  });

  it("рендерить «не за розкладом» як найтихіший стан — без бордера", () => {
    render(
      <HabitStreakCanvas
        habit={HABIT}
        completions={COMPLETIONS}
        skips={SKIPS}
        todayKey={TODAY}
      />,
    );
    const cell = screen.getByLabelText("25 лип.: не за розкладом");
    expect(cell).toBeInTheDocument();
    expect(cell.className).not.toContain("border");
  });

  it("сьогодні поза розкладом лишається «не за розкладом», а не pending", () => {
    render(
      <HabitStreakCanvas
        habit={HABIT}
        completions={COMPLETIONS}
        skips={SKIPS}
        todayKey={TODAY}
      />,
    );
    expect(
      screen.getByLabelText("2 серп.: не за розкладом"),
    ).toBeInTheDocument();
  });

  /*
   * Цей тест колись називався «зберігає сьогоднішній pending-день», але
   * перевіряв рівно протилежне: `TODAY` — неділя, а звичка головної фікстури
   * має розклад `weekdays`, тож сьогодні завжди `off`. Гілка `pending` не
   * виконувалась жодного разу.
   *
   * Власна фікстура, а не `COMPLETIONS`: під `daily` суботи й неділі
   * головної фікстури стають мовчазними пропусками, серія рветься, і
   * сьогоднішній день випадає з вікна ще до рендеру. Потрібна ціла серія,
   * що впирається просто в сьогодні.
   */
  it("сьогодні за розкладом і без відмітки — це pending, а не пропуск", () => {
    render(
      <HabitStreakCanvas
        habit={weekdaysHabit({
          recurrence: "daily",
          startDate: "2026-07-29",
        })}
        completions={["2026-07-29", "2026-07-30", "2026-07-31", "2026-08-01"]}
        todayKey={TODAY}
      />,
    );
    expect(
      screen.getByLabelText("2 серп.: сьогодні, ще попереду"),
    ).toBeInTheDocument();
  });

  it("показує повну легенду з пʼятьма пунктами", () => {
    render(
      <HabitStreakCanvas
        habit={HABIT}
        completions={COMPLETIONS}
        skips={SKIPS}
        todayKey={TODAY}
      />,
    );
    expect(screen.getByText("Виконано")).toBeInTheDocument();
    expect(screen.getByText("Не зміг, із причиною")).toBeInTheDocument();
    expect(
      screen.getByText("Мовчазний пропуск, прощений заморозкою"),
    ).toBeInTheDocument();
    expect(screen.getByText("Планована пауза")).toBeInTheDocument();
    expect(screen.getByText("Не за розкладом")).toBeInTheDocument();
  });

  it("рахує заморозки в підписі під заголовком", () => {
    render(
      <HabitStreakCanvas
        habit={HABIT}
        completions={COMPLETIONS}
        skips={SKIPS}
        todayKey={TODAY}
      />,
    );
    expect(screen.getByText(/1 заморозка витрачено/)).toBeInTheDocument();
  });

  it("показує дружній empty-state, коли в історії ще немає жодної відмітки", () => {
    render(
      <HabitStreakCanvas
        habit={weekdaysHabit()}
        completions={[]}
        todayKey={TODAY}
      />,
    );
    expect(screen.getByText(/Серія ще не почалась/)).toBeInTheDocument();
    expect(screen.getByText(/Тут зʼявиться полотно/)).toBeInTheDocument();
  });
});

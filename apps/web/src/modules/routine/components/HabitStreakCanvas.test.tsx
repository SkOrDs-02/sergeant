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

  // F-3 (спека reward-loop-and-reminders): мовчазний пропуск без власного
  // кольору, тим самим нейтральним сірим, що й «не виконано» в сітці.
  it("рендерить мовчазний пропуск нейтрально, без акценту модуля", () => {
    render(
      <HabitStreakCanvas
        habit={HABIT}
        completions={COMPLETIONS}
        skips={SKIPS}
        todayKey={TODAY}
      />,
    );
    const cell = screen.getByLabelText("28 лип.: без відмітки");
    expect(cell.className).toContain("bg-line/30");
    expect(cell.className).not.toMatch(/routine/);
    expect(cell.children).toHaveLength(0);
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

  it("рендерить «не за розкладом» як незаповнений нейтральний контур", () => {
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
    expect(cell.className).toContain("bg-transparent");
    expect(cell.className).not.toContain("routine");
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
    expect(screen.getByText("Без відмітки")).toBeInTheDocument();
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
    expect(screen.getByText(/1 заморозку витрачено/)).toBeInTheDocument();
  });

  it("показує дружній empty-state, коли в історії ще немає жодної відмітки", () => {
    render(
      <HabitStreakCanvas
        habit={weekdaysHabit()}
        completions={[]}
        todayKey={TODAY}
      />,
    );
    expect(screen.getByText(/Серії ще немає/)).toBeInTheDocument();
    // Відступ до легенди такий самий, як після полотна (`mb-4`).
    expect(screen.getByText(/Відміток ще немає/).className).toContain("mb-4");
  });
});

/** Ключі за N днів поспіль, що закінчуються на `endKey` включно. */
function runOfDays(endKey: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${endKey}T12:00:00`);
  for (let i = 0; i < count; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return out.sort();
}

// Р-4 (а), рішення власника 2026-11-18: запас заморозок видно під серією.
describe("HabitStreakCanvas: заморозки в запасі", () => {
  const DAILY = weekdaysHabit({ recurrence: "daily", startDate: "2026-07-01" });

  it("14 виконань поспіль: 3 з 4, звідки вони і коли наступна", () => {
    render(
      <HabitStreakCanvas
        habit={DAILY}
        completions={runOfDays(TODAY, 14)}
        todayKey={TODAY}
      />,
    );
    expect(screen.getByText("Заморозок у запасі: 3 з 4")).toBeInTheDocument();
    expect(
      screen.getByText(
        "1 стартова і 2 за 14 виконань. Наступна через 7 виконань.",
      ),
    ).toBeInTheDocument();
  });

  it("нова звичка без відміток уже має одну заморозку", () => {
    render(
      <HabitStreakCanvas habit={DAILY} completions={[]} todayKey={TODAY} />,
    );
    expect(screen.getByText("Заморозок у запасі: 1 з 4")).toBeInTheDocument();
    expect(
      screen.getByText("1 стартова. Наступна через 7 виконань."),
    ).toBeInTheDocument();
  });

  it("на стелі наступної не обіцяє", () => {
    render(
      <HabitStreakCanvas
        habit={weekdaysHabit({ recurrence: "daily", startDate: "2026-06-01" })}
        completions={runOfDays(TODAY, 30)}
        todayKey={TODAY}
      />,
    );
    expect(screen.getByText("Заморозок у запасі: 4 з 4")).toBeInTheDocument();
    expect(
      screen.getByText(
        "1 стартова і 3 за 30 виконань. Більше не накопичується.",
      ),
    ).toBeInTheDocument();
  });

  it("використана заморозка зменшує запас", () => {
    // 5 виконаних, 08-01 без відмітки, сьогодні виконано: стартова витрачена.
    render(
      <HabitStreakCanvas
        habit={weekdaysHabit({ recurrence: "daily", startDate: "2026-07-27" })}
        completions={[...runOfDays("2026-07-31", 5), TODAY]}
        todayKey={TODAY}
      />,
    );
    expect(screen.getByText("Заморозок у запасі: 0 з 4")).toBeInTheDocument();
    expect(
      screen.getByText("Стартову витрачено. Наступна через 1 виконання."),
    ).toBeInTheDocument();
    expect(screen.getByText(/6 днів поспіль/)).toBeInTheDocument();
  });

  it("легенда описує правило зі стартовою заморозкою", () => {
    render(
      <HabitStreakCanvas habit={DAILY} completions={[]} todayKey={TODAY} />,
    );
    expect(
      screen.getByText(
        "Заморозка рятує серію: 1 на старті, ще 1 за кожні 7 виконань, до 4. Два дні поспіль не прощаються.",
      ),
    ).toBeInTheDocument();
  });
});

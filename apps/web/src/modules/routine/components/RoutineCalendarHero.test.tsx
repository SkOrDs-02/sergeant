// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RoutineCalendarHero } from "./RoutineCalendarHero";

vi.mock("../hooks/useStreakFlame", () => ({
  useStreakFlame: (streak: number) => ({
    visible: streak > 0,
    intensity: streak >= 7 ? "medium" : "low",
    count: streak,
    reducedMotion: false,
  }),
}));

describe("RoutineCalendarHero", () => {
  afterEach(cleanup);

  it("renders today's progress summary without duplicated KPI counters", () => {
    render(
      <RoutineCalendarHero
        rangeLabel="Сьогодні"
        timeMode="today"
        headlineDate="10 липня"
        dayProgress={{ completed: 2, scheduled: 4 }}
        filteredCount={5}
        activeHabitsCount={3}
        completionRate={{ rate: 0.5, completed: 2, scheduled: 4 }}
        currentStreak={7}
        onOpenDayReport={vi.fn()}
      />,
    );

    expect(screen.getByText(/10 липня/)).toBeInTheDocument();
    expect(screen.getByText("Сьогоднішні звички")).toBeInTheDocument();
    expect(screen.getByText(/2 з 4 звичок виконано/)).toBeInTheDocument();
    expect(screen.queryByText("Подій")).not.toBeInTheDocument();
    expect(screen.queryByText("Виконання")).not.toBeInTheDocument();
  });

  /**
   * Кікер був хардкодом «Сьогоднішні звички» на всі режими, тож «Сьогодні» і
   * «Місяць» читались однаково (репорт власника 2026-08-17). Мод-залежний
   * `rangeLabel` існував, але йшов лише в `aria-label`.
   */
  it("кікер називає зріз, а не завжди «сьогоднішні»", () => {
    const seen = new Set<string>();
    for (const mode of ["today", "tomorrow", "day", "week", "month"] as const) {
      render(
        <RoutineCalendarHero
          rangeLabel="—"
          timeMode={mode}
          headlineDate="10 липня"
          dayProgress={{ completed: 0, scheduled: 0 }}
          filteredCount={0}
          activeHabitsCount={0}
          completionRate={{ rate: 0, completed: 0, scheduled: 0 }}
          currentStreak={0}
          onOpenDayReport={vi.fn()}
        />,
      );
      const kicker = screen.getByText(/звички/i).textContent ?? "";
      expect(seen.has(kicker)).toBe(false);
      seen.add(kicker);
      cleanup();
    }
    expect(seen.size).toBe(5);
  });

  it("opens day report via progress ring click", () => {
    const onOpenDayReport = vi.fn();
    render(
      <RoutineCalendarHero
        rangeLabel="Сьогодні"
        timeMode="today"
        headlineDate="10 липня"
        dayProgress={{ completed: 1, scheduled: 1 }}
        filteredCount={1}
        activeHabitsCount={1}
        completionRate={{ rate: 1, completed: 1, scheduled: 1 }}
        currentStreak={0}
        onOpenDayReport={onOpenDayReport}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Прогрес дня: 1 з 1/i,
      }),
    );
    expect(onOpenDayReport).toHaveBeenCalledTimes(1);
  });
});

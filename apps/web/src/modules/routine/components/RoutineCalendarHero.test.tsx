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

  it("opens day report via progress ring click", () => {
    const onOpenDayReport = vi.fn();
    render(
      <RoutineCalendarHero
        rangeLabel="Сьогодні"
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

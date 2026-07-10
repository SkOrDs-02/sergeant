// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RoutineCalendarHero } from "./RoutineCalendarHero";

vi.mock("../hooks/useStreakFlame", () => ({
  useStreakFlame: (streak: number) => ({
    visible: streak >= 3,
    count: streak,
  }),
}));

afterEach(cleanup);

describe("RoutineCalendarHero", () => {
  const baseProps = {
    rangeLabel: "23–29 червня",
    headlineDate: "Сьогодні",
    dayProgress: { completed: 2, scheduled: 4 },
    filteredCount: 12,
    activeHabitsCount: 5,
    completionRate: { rate: 0.5, completed: 2, scheduled: 4 },
    currentStreak: 0,
    onOpenDayReport: vi.fn(),
  };

  it("renders narrative, KPI strip, and progress ring", () => {
    render(<RoutineCalendarHero {...baseProps} />);
    expect(
      screen.getByText(/Сьогодні · 2 з 4 звичок · Серія 0 днів/),
    ).toBeInTheDocument();
    expect(screen.getByText("Подій")).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();
  });

  it("opens the day report when the ring is clicked", () => {
    const onOpenDayReport = vi.fn();
    render(
      <RoutineCalendarHero {...baseProps} onOpenDayReport={onOpenDayReport} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Прогрес дня: 2 з 4. Тапни для денного звіту",
      }),
    );
    expect(onOpenDayReport).toHaveBeenCalledOnce();
  });

  it("shows streak flame when current streak is at least three days", () => {
    render(<RoutineCalendarHero {...baseProps} currentStreak={5} />);
    expect(screen.getByLabelText("Streak: 5 days")).toBeInTheDocument();
  });
});

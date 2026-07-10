// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ScheduledHabitForReport } from "./DayReportSheet";
import { DayReportSheet } from "./DayReportSheet";

const habits: ScheduledHabitForReport[] = [
  {
    id: "h1",
    name: "Вода",
    emoji: "💧",
    completed: true,
    tagIds: [],
    categoryId: null,
    recurrence: "daily",
    startDate: "2026-01-01",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    archived: false,
  } as ScheduledHabitForReport,
  {
    id: "h2",
    name: "Читання",
    emoji: "📖",
    completed: false,
    tagIds: [],
    categoryId: null,
    recurrence: "daily",
    startDate: "2026-01-01",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    archived: false,
  } as ScheduledHabitForReport,
];

afterEach(cleanup);

describe("DayReportSheet", () => {
  it("shows empty state when no habits are scheduled", () => {
    render(
      <DayReportSheet
        open
        onClose={vi.fn()}
        dayLabel="25 червня"
        scheduledHabits={[]}
        onToggleHabit={vi.fn()}
        dateKey="2026-06-25"
      />,
    );
    expect(
      screen.getByText("На цей день немає запланованих звичок"),
    ).toBeInTheDocument();
  });

  it("lists completed and missed habits and toggles them", () => {
    const onToggleHabit = vi.fn();
    render(
      <DayReportSheet
        open
        onClose={vi.fn()}
        dayLabel="25 червня"
        scheduledHabits={habits}
        onToggleHabit={onToggleHabit}
        dateKey="2026-06-25"
      />,
    );
    expect(screen.getByText(/Виконано \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Пропущено \(1\)/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Скасувати виконання" }),
    );
    expect(onToggleHabit).toHaveBeenCalledWith("h1", "2026-06-25");
    fireEvent.click(
      screen.getByRole("button", { name: "Відмітити як виконано" }),
    );
    expect(onToggleHabit).toHaveBeenCalledWith("h2", "2026-06-25");
  });
});

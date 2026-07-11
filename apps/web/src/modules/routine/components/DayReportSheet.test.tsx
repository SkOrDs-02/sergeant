// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DayReportSheet } from "./DayReportSheet";
import type { ScheduledHabitForReport } from "./DayReportSheet";

function makeHabit(id: string, completed: boolean): ScheduledHabitForReport {
  return {
    id,
    name: `Звичка ${id}`,
    emoji: "✓",
    completed,
    tagIds: [],
    categoryId: null,
    recurrence: "daily",
    startDate: "2026-01-01",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    archived: false,
  } as ScheduledHabitForReport;
}

describe("DayReportSheet", () => {
  afterEach(cleanup);

  it("shows empty state when no habits are scheduled", () => {
    render(
      <DayReportSheet
        open={true}
        onClose={vi.fn()}
        dayLabel="10 липня"
        scheduledHabits={[]}
        onToggleHabit={vi.fn()}
        dateKey="2026-07-10"
      />,
    );

    expect(
      screen.getByText("На цей день немає запланованих звичок"),
    ).toBeInTheDocument();
  });

  it("lists done and missed habits and toggles completion", () => {
    const onToggleHabit = vi.fn();
    render(
      <DayReportSheet
        open={true}
        onClose={vi.fn()}
        dayLabel="10 липня"
        scheduledHabits={[makeHabit("h1", true), makeHabit("h2", false)]}
        onToggleHabit={onToggleHabit}
        dateKey="2026-07-10"
      />,
    );

    expect(screen.getByText(/Виконано \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Пропущено \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 з 2 виконано/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Відмітити як виконано" }),
    );
    expect(onToggleHabit).toHaveBeenCalledWith("h2", "2026-07-10");
  });
});

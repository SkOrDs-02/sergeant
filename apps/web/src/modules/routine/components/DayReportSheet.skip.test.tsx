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

const DATE = "2026-07-10";

describe("DayReportSheet — третій стан «не зміг з причиною»", () => {
  afterEach(cleanup);

  it("пропущений рядок пропонує заявити причину", () => {
    const onSetSkip = vi.fn();
    render(
      <DayReportSheet
        open
        onClose={vi.fn()}
        dayLabel="10 липня"
        scheduledHabits={[makeHabit("a", false)]}
        onToggleHabit={vi.fn()}
        dateKey={DATE}
        onSetSkip={onSetSkip}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Не зміг" }));
    fireEvent.click(screen.getByRole("button", { name: "Хворів" }));
    expect(onSetSkip).toHaveBeenCalledWith("a", "sick");
  });

  it("заявлений пропуск виходить із «Пропущено» в окрему групу", () => {
    render(
      <DayReportSheet
        open
        onClose={vi.fn()}
        dayLabel="10 липня"
        scheduledHabits={[makeHabit("a", false), makeHabit("b", false)]}
        onToggleHabit={vi.fn()}
        dateKey={DATE}
        skipsForDay={{ a: { reason: "travel", at: "2026-07-10T08:00:00Z" } }}
        onSetSkip={vi.fn()}
        onClearSkip={vi.fn()}
      />,
    );

    expect(screen.getByText("Не зміг (1)")).toBeInTheDocument();
    expect(screen.getByText("Пропущено (1)")).toBeInTheDocument();
    expect(screen.getByText("У дорозі")).toBeInTheDocument();
  });

  it("знаменник підсумку не рахує заявлені пропуски провалом", () => {
    render(
      <DayReportSheet
        open
        onClose={vi.fn()}
        dayLabel="10 липня"
        scheduledHabits={[
          makeHabit("a", true),
          makeHabit("b", false),
          makeHabit("c", false),
        ]}
        onToggleHabit={vi.fn()}
        dateKey={DATE}
        skipsForDay={{ c: { reason: "sick", at: "2026-07-10T08:00:00Z" } }}
        onSetSkip={vi.fn()}
      />,
    );

    // 1 виконано з 2 порахованих (третій — заявлений пропуск), а не з 3.
    expect(screen.getByText(/1 з 2 виконано/)).toBeInTheDocument();
    expect(screen.getByText(/не зміг: 1/)).toBeInTheDocument();
  });

  it("без `onSetSkip` поверхня лишається старою — кнопки немає", () => {
    render(
      <DayReportSheet
        open
        onClose={vi.fn()}
        dayLabel="10 липня"
        scheduledHabits={[makeHabit("a", false)]}
        onToggleHabit={vi.fn()}
        dateKey={DATE}
      />,
    );
    expect(screen.queryByRole("button", { name: "Не зміг" })).toBeNull();
  });
});

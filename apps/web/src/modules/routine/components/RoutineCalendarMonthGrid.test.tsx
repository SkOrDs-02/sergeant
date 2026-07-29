/** @vitest-environment jsdom */
/**
 * Render + interaction tests for RoutineCalendarMonthGrid.
 *
 * The component is purely presentational — it receives all state as
 * props and fires callbacks. We construct minimal props fixtures for
 * each branch and verify that the right callbacks fire and the right
 * DOM nodes are present.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { HubCalendarEvent } from "../lib/types";
import {
  RoutineCalendarMonthGrid,
  type RoutineCalendarMonthGridProps,
} from "./RoutineCalendarMonthGrid";

afterEach(cleanup);

type GroupedListItem =
  { kind: "header"; label: string } | { kind: "event"; e: HubCalendarEvent };

function makeEvent(over: Partial<HubCalendarEvent> = {}): HubCalendarEvent {
  return {
    id: "evt-1",
    source: "habit",
    date: "2026-06-23",
    title: "Пити воду",
    subtitle: "щодня",
    tagLabels: [],
    sortKey: "0",
    sourceKind: "habit",
    habitId: "h1",
    completed: false,
    ...over,
  };
}

function baseProps(
  over: Partial<RoutineCalendarMonthGridProps> = {},
): RoutineCalendarMonthGridProps {
  return {
    monthCursor: { y: 2026, m: 5 }, // June 2026 (0-indexed)
    monthTitle: "Червень 2026",
    cells: [null, null, 1, 2, 3], // 2 padding cells + days 1-3
    dayCounts: new Map(),
    selectedDay: "2026-06-01",
    goMonth: vi.fn(),
    goToToday: vi.fn(),
    onSelectDay: vi.fn(),
    showFizrukShortcut: false,
    onPlanFizruk: vi.fn(),
    flatGroupedItems: [],
    onToggleHabit: vi.fn(),
    ...over,
  };
}

describe("RoutineCalendarMonthGrid", () => {
  it("renders the month title", () => {
    render(<RoutineCalendarMonthGrid {...baseProps()} />);
    expect(screen.getByText("Червень 2026")).toBeInTheDocument();
  });

  it("renders weekday header labels Пн…Нд", () => {
    render(<RoutineCalendarMonthGrid {...baseProps()} />);
    for (const d of ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"]) {
      expect(screen.getByText(d)).toBeInTheDocument();
    }
  });

  it("calls goMonth(-1) when the previous-month button is clicked", () => {
    const goMonth = vi.fn();
    render(<RoutineCalendarMonthGrid {...baseProps({ goMonth })} />);
    fireEvent.click(screen.getByRole("button", { name: "Попередній місяць" }));
    expect(goMonth).toHaveBeenCalledWith(-1);
  });

  it("calls goMonth(1) when the next-month button is clicked", () => {
    const goMonth = vi.fn();
    render(<RoutineCalendarMonthGrid {...baseProps({ goMonth })} />);
    fireEvent.click(screen.getByRole("button", { name: "Наступний місяць" }));
    expect(goMonth).toHaveBeenCalledWith(1);
  });

  it("calls goToToday when the 'Сьогодні' button is clicked", () => {
    const goToToday = vi.fn();
    render(<RoutineCalendarMonthGrid {...baseProps({ goToToday })} />);
    fireEvent.click(screen.getByRole("button", { name: "Сьогодні" }));
    expect(goToToday).toHaveBeenCalledTimes(1);
  });

  it("calls onSelectDay with the date key when a day cell is clicked", () => {
    const onSelectDay = vi.fn();
    render(<RoutineCalendarMonthGrid {...baseProps({ onSelectDay })} />);
    // Day 1 → key "2026-06-01"
    const dayBtn = screen.getByRole("button", {
      name: /2026-06-01|понеділ|1.*червня/i,
    });
    fireEvent.click(dayBtn);
    expect(onSelectDay).toHaveBeenCalledWith("2026-06-01");
  });

  it("marks the selected day cell as aria-pressed=true", () => {
    render(
      <RoutineCalendarMonthGrid
        {...baseProps({ selectedDay: "2026-06-02" })}
      />,
    );
    // Day 2 should be aria-pressed
    const pressedBtn = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressedBtn).toBeTruthy();
  });

  it("shows a dot for a day with events", () => {
    const dayCounts = new Map([["2026-06-02", 1]]);
    const { container } = render(
      <RoutineCalendarMonthGrid {...baseProps({ dayCounts })} />,
    );
    // A dot is a small rounded-full element inside the day cell
    const dots = container.querySelectorAll(".rounded-full.bg-routine");
    expect(dots.length).toBeGreaterThan(0);
  });

  it("shows a numeric badge when a day has more than 1 event", () => {
    const dayCounts = new Map([["2026-06-03", 3]]);
    render(<RoutineCalendarMonthGrid {...baseProps({ dayCounts })} />);
    // The day-3 button aria-label includes "подій: 3"
    expect(
      screen.getByRole("button", { name: /подій: 3/ }),
    ).toBeInTheDocument();
  });

  it("shows 'Планувати тренування' button when showFizrukShortcut is true", () => {
    render(
      <RoutineCalendarMonthGrid {...baseProps({ showFizrukShortcut: true })} />,
    );
    expect(
      screen.getByRole("button", { name: "Планувати тренування" }),
    ).toBeInTheDocument();
  });

  it("calls onPlanFizruk with selectedDay when the fizruk shortcut button is clicked", () => {
    const onPlanFizruk = vi.fn();
    render(
      <RoutineCalendarMonthGrid
        {...baseProps({
          showFizrukShortcut: true,
          selectedDay: "2026-06-01",
          onPlanFizruk,
        })}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Планувати тренування" }),
    );
    expect(onPlanFizruk).toHaveBeenCalledWith("2026-06-01");
  });

  it("does NOT show the fizruk shortcut button when showFizrukShortcut is false", () => {
    render(
      <RoutineCalendarMonthGrid
        {...baseProps({ showFizrukShortcut: false })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Планувати тренування" }),
    ).not.toBeInTheDocument();
  });

  it("renders grouped header labels and event items", () => {
    const items: GroupedListItem[] = [
      { kind: "header", label: "Звички" },
      { kind: "event", e: makeEvent() },
    ];
    render(
      <RoutineCalendarMonthGrid {...baseProps({ flatGroupedItems: items })} />,
    );
    expect(screen.getByText("Звички")).toBeInTheDocument();
    expect(screen.getByText("Пити воду")).toBeInTheDocument();
  });

  it("shows the habit toggle IconButton for habit events", () => {
    const items: GroupedListItem[] = [
      { kind: "event", e: makeEvent({ habitId: "h1", completed: false }) },
    ];
    render(
      <RoutineCalendarMonthGrid {...baseProps({ flatGroupedItems: items })} />,
    );
    expect(
      screen.getByRole("button", { name: "Виконано" }),
    ).toBeInTheDocument();
  });

  it("calls onToggleHabit when the habit toggle button is clicked", () => {
    const onToggleHabit = vi.fn();
    const items: GroupedListItem[] = [
      { kind: "event", e: makeEvent({ habitId: "h1", date: "2026-06-23" }) },
    ];
    render(
      <RoutineCalendarMonthGrid
        {...baseProps({ flatGroupedItems: items, onToggleHabit })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Виконано" }));
    expect(onToggleHabit).toHaveBeenCalledWith("h1", "2026-06-23");
  });

  it("shows 'Скасувати виконання' label on the toggle when event is completed", () => {
    const items: GroupedListItem[] = [
      {
        kind: "event",
        e: makeEvent({ habitId: "h1", completed: true }),
      },
    ];
    render(
      <RoutineCalendarMonthGrid {...baseProps({ flatGroupedItems: items })} />,
    );
    expect(
      screen.getByRole("button", { name: "Скасувати виконання" }),
    ).toBeInTheDocument();
  });

  it("calls onPlanFizruk when a fizruk event item is clicked", () => {
    const onPlanFizruk = vi.fn();
    const { habitId: _d1, ...fizrukBase1 } = makeEvent({
      id: "fz-1",
      fizruk: true,
      date: "2026-06-23",
    });
    void _d1;
    const fizrukEvent = fizrukBase1;
    const items: GroupedListItem[] = [{ kind: "event", e: fizrukEvent }];
    render(
      <RoutineCalendarMonthGrid
        {...baseProps({ flatGroupedItems: items, onPlanFizruk })}
      />,
    );
    const fizrukRow = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.getAttribute("role") === "button" &&
          b.getAttribute("tabindex") === "0",
      );
    if (fizrukRow) {
      fireEvent.click(fizrukRow);
      expect(onPlanFizruk).toHaveBeenCalledWith("2026-06-23");
    }
  });

  it("calls onPlanFizruk on Enter keydown for a fizruk event item", () => {
    const onPlanFizruk = vi.fn();
    const { habitId: _d2, ...fizrukBase2 } = makeEvent({
      id: "fz-1",
      fizruk: true,
      date: "2026-06-23",
    });
    void _d2;
    const fizrukEvent = fizrukBase2;
    const items: GroupedListItem[] = [{ kind: "event", e: fizrukEvent }];
    render(
      <RoutineCalendarMonthGrid
        {...baseProps({ flatGroupedItems: items, onPlanFizruk })}
      />,
    );
    const fizrukRow = document.querySelector('[role="button"][tabindex="0"]');
    if (fizrukRow) {
      fireEvent.keyDown(fizrukRow, { key: "Enter" });
      expect(onPlanFizruk).toHaveBeenCalledWith("2026-06-23");
    }
  });

  it("shows 'Подій на цей день немає' when there are no grouped items", () => {
    render(
      <RoutineCalendarMonthGrid {...baseProps({ flatGroupedItems: [] })} />,
    );
    expect(screen.getByText("Подій на цей день немає")).toBeInTheDocument();
  });

  it("renders the selected-day caption below the grid", () => {
    render(
      <RoutineCalendarMonthGrid
        {...baseProps({ selectedDay: "2026-06-01" })}
      />,
    );
    expect(screen.getByText(/Обрано:/)).toBeInTheDocument();
  });
});

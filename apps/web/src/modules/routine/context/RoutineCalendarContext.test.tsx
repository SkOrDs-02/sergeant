/** @vitest-environment jsdom */
/**
 * Unit tests for RoutineCalendarContext.
 *
 * Covers:
 *  - RoutineCalendarProvider renders children.
 *  - useRoutineCalendarData returns data from the closest provider.
 *  - useRoutineCalendarActions returns actions from the closest provider.
 *  - Both hooks throw when used outside the provider tree.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { defaultRoutineState } from "@sergeant/routine-domain";
import type { ReactNode } from "react";
import {
  RoutineCalendarProvider,
  useRoutineCalendarData,
  useRoutineCalendarActions,
  type RoutineCalendarData,
  type RoutineCalendarActions,
} from "./RoutineCalendarContext";

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

function makeData(
  overrides: Partial<RoutineCalendarData> = {},
): RoutineCalendarData {
  return {
    rangeLabel: "Сьогодні",
    headlineDate: "2026-07-10",
    filtered: [],
    routine: defaultRoutineState(),
    currentStreak: 3,
    completionRate: { completed: 2, scheduled: 4, rate: 0.5 },
    dayProgress: { completed: 1, scheduled: 3 },
    timeMode: "today",
    selectedDay: "2026-07-10",
    todayKey: "2026-07-10",
    shiftWeekStrip: vi.fn(),
    setSelectedDay: vi.fn(),
    setTimeMode: vi.fn(),
    listQuery: "",
    setListQuery: vi.fn(),
    tagFilter: null,
    setTagFilter: vi.fn(),
    tagChips: [],
    monthCursor: { y: 2026, m: 7 },
    monthTitle: "Липень 2026",
    goMonth: vi.fn(),
    goToToday: vi.fn(),
    cells: [1, 2, 3],
    dayCounts: new Map(),
    listIsEmpty: false,
    hasListFilter: false,
    hasNoHabits: false,
    grouped: [],
    canBulkMark: false,
    ...overrides,
  };
}

function makeActions(
  overrides: Partial<RoutineCalendarActions> = {},
): RoutineCalendarActions {
  return {
    applyTimeMode: vi.fn(),
    onToggleHabit: vi.fn(),
    setRoutine: vi.fn(),
    setMainTab: vi.fn(),
    onOpenModule: undefined,
    onBulkMarkDay: vi.fn(),
    onOpenQuickAddHabit: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: component that reads context values
// ---------------------------------------------------------------------------

function DataConsumer() {
  const data = useRoutineCalendarData();
  return (
    <div>
      <span data-testid="streak">{data.currentStreak}</span>
      <span data-testid="time-mode">{data.timeMode}</span>
      <span data-testid="range-label">{data.rangeLabel}</span>
    </div>
  );
}

function ActionsConsumer() {
  const actions = useRoutineCalendarActions();
  return (
    <div>
      <button
        data-testid="toggle"
        onClick={() => actions.onToggleHabit("h1", "2026-07-10")}
      >
        toggle
      </button>
      <button data-testid="bulk-mark" onClick={() => actions.onBulkMarkDay()}>
        bulk mark
      </button>
    </div>
  );
}

function DataAndActionsConsumer() {
  return (
    <>
      <DataConsumer />
      <ActionsConsumer />
    </>
  );
}

function wrapper(data: RoutineCalendarData, actions: RoutineCalendarActions) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <RoutineCalendarProvider data={data} actions={actions}>
        {children}
      </RoutineCalendarProvider>
    );
  }
  return Wrapper;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RoutineCalendarProvider", () => {
  it("renders children inside the provider", () => {
    const data = makeData();
    const actions = makeActions();
    render(
      <RoutineCalendarProvider data={data} actions={actions}>
        <span data-testid="child">hello</span>
      </RoutineCalendarProvider>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});

describe("useRoutineCalendarData", () => {
  it("returns the data value supplied to the provider", () => {
    const data = makeData({ currentStreak: 7, timeMode: "week" });
    const actions = makeActions();
    const Wrapper = wrapper(data, actions);
    render(<DataConsumer />, { wrapper: Wrapper });

    expect(screen.getByTestId("streak").textContent).toBe("7");
    expect(screen.getByTestId("time-mode").textContent).toBe("week");
    expect(screen.getByTestId("range-label").textContent).toBe("Сьогодні");
  });

  it("throws when used outside of RoutineCalendarProvider", () => {
    // Suppress the expected React error boundary console.error.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    expect(() => render(<DataConsumer />)).toThrow(
      "useRoutineCalendarData must be used within RoutineCalendarProvider",
    );
    consoleError.mockRestore();
  });
});

describe("useRoutineCalendarActions", () => {
  it("returns the actions value supplied to the provider", () => {
    const onToggleHabit = vi.fn();
    const data = makeData();
    const actions = makeActions({ onToggleHabit });
    const Wrapper = wrapper(data, actions);
    render(<ActionsConsumer />, { wrapper: Wrapper });

    screen.getByTestId("toggle").click();
    expect(onToggleHabit).toHaveBeenCalledWith("h1", "2026-07-10");
  });

  it("throws when used outside of RoutineCalendarProvider", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    expect(() => render(<ActionsConsumer />)).toThrow(
      "useRoutineCalendarActions must be used within RoutineCalendarProvider",
    );
    consoleError.mockRestore();
  });

  it("calls onBulkMarkDay from actions when bulk-mark button is clicked", () => {
    const onBulkMarkDay = vi.fn();
    const data = makeData();
    const actions = makeActions({ onBulkMarkDay });
    const Wrapper = wrapper(data, actions);
    render(<ActionsConsumer />, { wrapper: Wrapper });

    screen.getByTestId("bulk-mark").click();
    expect(onBulkMarkDay).toHaveBeenCalledTimes(1);
  });
});

describe("RoutineCalendarProvider — nested consumers", () => {
  it("both data and actions consumers can coexist in the same tree", () => {
    const onToggleHabit = vi.fn();
    const data = makeData({ currentStreak: 5, timeMode: "month" });
    const actions = makeActions({ onToggleHabit });
    const Wrapper = wrapper(data, actions);
    render(<DataAndActionsConsumer />, { wrapper: Wrapper });

    expect(screen.getByTestId("streak").textContent).toBe("5");
    expect(screen.getByTestId("time-mode").textContent).toBe("month");
    screen.getByTestId("toggle").click();
    expect(onToggleHabit).toHaveBeenCalledWith("h1", "2026-07-10");
  });
});

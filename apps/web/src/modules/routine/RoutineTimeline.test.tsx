// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { defaultRoutineState } from "@sergeant/routine-domain";
import { RoutineTimeline } from "./RoutineTimeline";
import type {
  RoutineCalendarActions,
  RoutineCalendarData,
} from "./context/RoutineCalendarContext";

vi.mock("@shared/hooks/useCloudPullPending", () => ({
  useCloudPullPending: () => false,
}));

vi.mock("./components/RoutineCalendarPanel", () => ({
  RoutineCalendarPanel: ({ hidden }: { hidden?: boolean }) =>
    hidden ? null : <div data-testid="calendar-panel">Календар</div>,
}));

vi.mock("./components/RoutineStatsPanel", () => ({
  RoutineStatsPanel: ({ hidden }: { hidden?: boolean }) =>
    hidden ? null : <div data-testid="stats-panel">Статистика</div>,
}));

function makeCalendarData(): RoutineCalendarData {
  return {
    rangeLabel: "Сьогодні",
    headlineDate: "2026-07-10",
    filtered: [],
    routine: defaultRoutineState(),
    currentStreak: 2,
    completionRate: { completed: 1, scheduled: 2, rate: 0.5 },
    dayProgress: { completed: 1, scheduled: 2 },
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
    cells: [],
    dayCounts: new Map(),
    listIsEmpty: false,
    hasListFilter: false,
    hasNoHabits: false,
    grouped: [],
    canBulkMark: false,
  };
}

function makeCalendarActions(): RoutineCalendarActions {
  return {
    applyTimeMode: vi.fn(),
    onToggleHabit: vi.fn(),
    setRoutine: vi.fn(),
    setMainTab: vi.fn(),
    onBulkMarkDay: vi.fn(),
    onOpenQuickAddHabit: vi.fn(),
  };
}

describe("RoutineTimeline", () => {
  afterEach(cleanup);

  it("shows storage error banner and dismisses it", () => {
    const onDismissStorageError = vi.fn();
    render(
      <RoutineTimeline
        storageErrorMsg="quota exceeded"
        onDismissStorageError={onDismissStorageError}
        calendarData={makeCalendarData()}
        calendarActions={makeCalendarActions()}
        isHabitPending={false}
        mainTab="calendar"
        routine={defaultRoutineState()}
        streakMax={3}
        onPullRefresh={vi.fn(async () => undefined)}
        onPullRefreshError={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("quota exceeded");
    fireEvent.click(
      screen.getByRole("button", { name: "Закрити повідомлення" }),
    );
    expect(onDismissStorageError).toHaveBeenCalledTimes(1);
  });

  it("shows calendar panel on calendar tab and hides stats", () => {
    render(
      <RoutineTimeline
        storageErrorMsg={null}
        onDismissStorageError={vi.fn()}
        calendarData={makeCalendarData()}
        calendarActions={makeCalendarActions()}
        isHabitPending={false}
        mainTab="calendar"
        routine={defaultRoutineState()}
        streakMax={3}
        onPullRefresh={vi.fn(async () => undefined)}
        onPullRefreshError={vi.fn()}
      />,
    );

    expect(screen.getByTestId("calendar-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("stats-panel")).not.toBeInTheDocument();
  });

  it("shows stats panel on stats tab", () => {
    render(
      <RoutineTimeline
        storageErrorMsg={null}
        onDismissStorageError={vi.fn()}
        calendarData={makeCalendarData()}
        calendarActions={makeCalendarActions()}
        isHabitPending={false}
        mainTab="stats"
        routine={defaultRoutineState()}
        streakMax={3}
        onPullRefresh={vi.fn(async () => undefined)}
        onPullRefreshError={vi.fn()}
      />,
    );

    expect(screen.getByTestId("stats-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("calendar-panel")).not.toBeInTheDocument();
  });
});

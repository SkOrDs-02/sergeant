// @vitest-environment jsdom
/**
 * Smoke + wiring tests for RoutineApp — the thin composition root.
 * Mocks useRoutineAppState and child shards; verifies public props
 * (onBackToHub, pwaAction, onPwaActionConsumed, onOpenModule) reach
 * the right call-sites without pulling the full orchestrator graph.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { RoutineAppStateBundle } from "./useRoutineAppState";

const routineAppMocks = vi.hoisted(() => {
  const stateBundle = {
    routine: {
      schemaVersion: 1,
      habits: [],
      completions: {},
      prefs: {},
      tags: [],
      categories: [],
      archivedHabits: [],
      version: 1,
      updatedAt: 0,
    },
    setRoutine: vi.fn(),
    isHabitPending: false,
    storageErrorMsg: null,
    setStorageErrorMsg: vi.fn(),
    mainTab: "calendar" as const,
    setMainTab: vi.fn(),
    quickAddHabitOpen: false,
    quickAddFocusTick: 0,
    quickAddFirstRunHint: false,
    dismissQuickAddFirstRunHint: vi.fn(),
    openQuickAddHabit: vi.fn(),
    closeQuickAddHabit: vi.fn(),
    streakMax: 0,
    calendarData: {
      rangeLabel: "Тиждень",
      headlineDate: "Сьогодні",
      filtered: [],
      routine: {
        schemaVersion: 1,
        habits: [],
        completions: {},
        prefs: {},
        tags: [],
        categories: [],
        archivedHabits: [],
        version: 1,
        updatedAt: 0,
      },
      currentStreak: 0,
      completionRate: { completed: 0, scheduled: 0, rate: 0 },
      dayProgress: { completed: 0, scheduled: 0 },
      timeMode: "week" as const,
      selectedDay: "2026-06-25",
      todayKey: "2026-06-25",
      shiftWeekStrip: vi.fn(),
      setSelectedDay: vi.fn(),
      setTimeMode: vi.fn(),
      listQuery: "",
      setListQuery: vi.fn(),
      tagFilter: null,
      setTagFilter: vi.fn(),
      tagChips: [],
      monthCursor: { y: 2026, m: 6 },
      monthTitle: "Червень",
      goMonth: vi.fn(),
      goToToday: vi.fn(),
      cells: [],
      dayCounts: new Map<string, number>(),
      listIsEmpty: true,
      hasListFilter: false,
      hasNoHabits: false,
      grouped: [],
      canBulkMark: false,
    },
    calendarActions: {
      applyTimeMode: vi.fn(),
      onToggleHabit: vi.fn(),
      setRoutine: vi.fn(),
      setMainTab: vi.fn(),
      onBulkMarkDay: vi.fn(),
      onOpenQuickAddHabit: vi.fn(),
      onOpenModule: undefined,
    },
    handlePullRefresh: vi.fn(async () => undefined),
    handlePullRefreshError: vi.fn(),
  } as unknown as RoutineAppStateBundle;

  return {
    stateBundle,
    useRoutineAppState: vi.fn(() => stateBundle),
    headerProps: null as {
      onBackToHub?: (() => void) | undefined;
      onOpenSettings?: (() => void) | undefined;
    } | null,
    timelineProps: null as Record<string, unknown> | null,
    actionsProps: null as Record<string, unknown> | null,
  };
});

vi.mock("./useRoutineAppState", () => ({
  useRoutineAppState: routineAppMocks.useRoutineAppState,
}));

vi.mock("./RoutineHeader", () => ({
  RoutineHeader: (props: {
    onBackToHub?: () => void;
    onOpenSettings?: () => void;
  }) => {
    routineAppMocks.headerProps = props;
    return (
      <div data-testid="routine-header">
        {typeof props.onBackToHub === "function" ? (
          <button type="button" onClick={props.onBackToHub}>
            До хабу
          </button>
        ) : null}
        {typeof props.onOpenSettings === "function" ? (
          <button type="button" onClick={props.onOpenSettings}>
            Налаштування
          </button>
        ) : null}
      </div>
    );
  },
}));

vi.mock("./RoutineTimeline", () => ({
  RoutineTimeline: (props: Record<string, unknown>) => {
    routineAppMocks.timelineProps = props;
    return <div data-testid="routine-timeline" />;
  },
}));

vi.mock("./RoutineActions", () => ({
  RoutineActions: (props: Record<string, unknown>) => {
    routineAppMocks.actionsProps = props;
    return <div data-testid="routine-actions" />;
  },
}));

vi.mock("@shared/components/ui/AIPill", () => ({
  AIPill: () => <div data-testid="ai-pill" />,
}));

import RoutineApp from "./RoutineApp";

describe("RoutineApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routineAppMocks.headerProps = null;
    routineAppMocks.timelineProps = null;
    routineAppMocks.actionsProps = null;
  });

  it("renders the module shell shards without throwing", () => {
    render(<RoutineApp />);
    expect(screen.getByTestId("routine-header")).toBeInTheDocument();
    expect(screen.getByTestId("routine-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("routine-actions")).toBeInTheDocument();
    expect(screen.getByTestId("ai-pill")).toBeInTheDocument();
  });

  it("wires onBackToHub through RoutineHeader", () => {
    const onBackToHub = vi.fn();
    render(<RoutineApp onBackToHub={onBackToHub} />);
    expect(routineAppMocks.headerProps?.onBackToHub).toBe(onBackToHub);
    fireEvent.click(screen.getByRole("button", { name: "До хабу" }));
    expect(onBackToHub).toHaveBeenCalledTimes(1);
  });

  it("wires onOpenSettings through RoutineHeader", () => {
    const onOpenSettings = vi.fn();
    render(<RoutineApp onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByRole("button", { name: "Налаштування" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("passes pwaAction and callbacks into useRoutineAppState", async () => {
    const onPwaActionConsumed = vi.fn();
    const onOpenModule = vi.fn();
    const { rerender } = render(
      <RoutineApp
        pwaAction={null}
        onPwaActionConsumed={onPwaActionConsumed}
        onOpenModule={onOpenModule}
      />,
    );

    expect(routineAppMocks.useRoutineAppState).toHaveBeenCalledWith({
      pwaAction: null,
      onPwaActionConsumed,
      onOpenModule,
    });

    rerender(
      <RoutineApp
        pwaAction="add_habit"
        onPwaActionConsumed={onPwaActionConsumed}
        onOpenModule={onOpenModule}
      />,
    );

    await waitFor(() => {
      expect(routineAppMocks.useRoutineAppState).toHaveBeenLastCalledWith({
        pwaAction: "add_habit",
        onPwaActionConsumed,
        onOpenModule,
      });
    });
  });

  it("forwards orchestrator state into RoutineTimeline and RoutineActions", () => {
    render(<RoutineApp />);
    expect(routineAppMocks.timelineProps).toMatchObject({
      storageErrorMsg: null,
      mainTab: "calendar",
      streakMax: 0,
    });
    expect(routineAppMocks.actionsProps).toMatchObject({
      mainTab: "calendar",
      quickAddHabitOpen: false,
      quickAddFirstRunHint: false,
    });
  });
});

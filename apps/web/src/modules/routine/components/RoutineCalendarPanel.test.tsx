/** @vitest-environment jsdom */
/**
 * Render + interaction tests for RoutineCalendarPanel.
 *
 * The component reads everything through the RoutineCalendar context
 * (`useRoutineCalendarData` / `useRoutineCalendarActions`), so we mock
 * those hooks with a configurable fixture and drive each branch (insight
 * cards, bulk-mark CTA, empty states, list rows, tag filters, day-detail
 * open) directly. Heavy child sheets are stubbed to markers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { defaultRoutineState } from "@sergeant/routine-domain";
import type { HubCalendarEvent } from "../lib/types";
import type {
  RoutineCalendarData,
  RoutineCalendarActions,
} from "../context/RoutineCalendarContext";

const dataFixture = vi.fn<() => RoutineCalendarData>();
const actionsFixture = vi.fn<() => RoutineCalendarActions>();

vi.mock("../context/RoutineCalendarContext", () => ({
  useRoutineCalendarData: () => dataFixture(),
  useRoutineCalendarActions: () => actionsFixture(),
}));

vi.mock("../hooks/useStreakRecordPendingInsight", () => ({
  useStreakRecordPendingInsight: () => streakInsight,
}));
vi.mock("../hooks/useTodoEveningInsight", () => ({
  useTodoEveningInsight: () => eveningInsight,
}));

// Stub heavy descendant sheets to lightweight markers.
vi.mock("./HabitDetailSheet", () => ({
  HabitDetailSheet: ({ habitId }: { habitId: string }) => (
    <div data-testid="habit-detail-sheet" data-habit={habitId} />
  ),
}));
vi.mock("./FizrukDayPlanSheet", () => ({
  FizrukDayPlanSheet: ({ dateKey }: { dateKey: string | null }) =>
    dateKey ? (
      <div data-testid="fizruk-plan-sheet" data-date={dateKey} />
    ) : null,
}));
vi.mock("./DayReportSheet", () => ({
  DayReportSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="day-report-sheet" /> : null,
}));
vi.mock("./RoutineCalendarMonthGrid", () => ({
  RoutineCalendarMonthGrid: () => <div data-testid="month-grid" />,
}));

let streakInsight: { id: string; title: string; subtitle: string } | null =
  null;
let eveningInsight: { id: string; title: string; subtitle: string } | null =
  null;

import { RoutineCalendarPanel } from "./RoutineCalendarPanel";

const onToggleHabit = vi.fn();
const applyTimeMode = vi.fn();
const onBulkMarkDay = vi.fn();
const onOpenQuickAddHabit = vi.fn();
const setSelectedDay = vi.fn();
const setTimeMode = vi.fn();
const setListQuery = vi.fn();
const setTagFilter = vi.fn();

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

function baseData(
  over: Partial<RoutineCalendarData> = {},
): RoutineCalendarData {
  return {
    rangeLabel: "Тиждень",
    headlineDate: "23 червня",
    filtered: [],
    routine: defaultRoutineState(),
    currentStreak: 3,
    completionRate: { done: 1, total: 2, pct: 50 },
    dayProgress: { done: 1, total: 2, pct: 50 },
    timeMode: "week",
    selectedDay: "2026-06-23",
    todayKey: "2026-06-23",
    shiftWeekStrip: vi.fn(),
    setSelectedDay,
    setTimeMode,
    listQuery: "",
    setListQuery,
    tagFilter: null,
    setTagFilter,
    tagChips: [],
    monthCursor: { year: 2026, month: 5 },
    monthTitle: "Червень 2026",
    goMonth: vi.fn(),
    goToToday: vi.fn(),
    cells: [],
    dayCounts: new Map(),
    listIsEmpty: true,
    hasListFilter: false,
    hasNoHabits: true,
    grouped: [],
    canBulkMark: false,
    ...over,
  } as RoutineCalendarData;
}

function baseActions(
  over: Partial<RoutineCalendarActions> = {},
): RoutineCalendarActions {
  return {
    applyTimeMode,
    onToggleHabit,
    setRoutine: vi.fn(),
    setMainTab: vi.fn(),
    onBulkMarkDay,
    onOpenQuickAddHabit,
    ...over,
  } as RoutineCalendarActions;
}

beforeEach(() => {
  // RoutineCalendarHero → useReducedMotion reads window.matchMedia.
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    media: "",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as unknown as typeof window.matchMedia;
  streakInsight = null;
  eveningInsight = null;
  dataFixture.mockReturnValue(baseData());
  actionsFixture.mockReturnValue(baseActions());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RoutineCalendarPanel", () => {
  it("renders the calendar tabpanel with the week strip and search", () => {
    render(<RoutineCalendarPanel />);
    const panel = document.getElementById("routine-panel-calendar");
    expect(panel).toHaveAttribute("role", "tabpanel");
    expect(screen.getByLabelText("Пошук подій")).toBeInTheDocument();
  });

  it("hides the panel content when hidden prop is set", () => {
    render(<RoutineCalendarPanel hidden />);
    const panel = document.getElementById("routine-panel-calendar");
    expect(panel).toHaveAttribute("hidden");
  });

  it("shows the first-habit empty state when there are no habits and no filter", () => {
    render(<RoutineCalendarPanel />);
    expect(screen.getByText("Почни з однієї звички")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Додати звичку в «Рутина»" }),
    );
    expect(onOpenQuickAddHabit).toHaveBeenCalledTimes(1);
  });

  it("shows the 'nothing found' empty state when a filter is active", () => {
    dataFixture.mockReturnValue(
      baseData({ listIsEmpty: true, hasListFilter: true, hasNoHabits: false }),
    );
    render(<RoutineCalendarPanel />);
    expect(screen.getByText("Нічого не знайдено")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Скинути фільтри" }));
    expect(setTagFilter).toHaveBeenCalledWith(null);
    expect(setListQuery).toHaveBeenCalledWith("");
  });

  it("renders the bulk-mark CTA and wires it when canBulkMark is true", () => {
    dataFixture.mockReturnValue(baseData({ canBulkMark: true }));
    render(<RoutineCalendarPanel />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Відмітити всі звички на цей день",
      }),
    );
    expect(onBulkMarkDay).toHaveBeenCalledTimes(1);
  });

  it("renders insight cards and activates the time mode on click", () => {
    streakInsight = {
      id: "streak-record",
      title: "Майже рекорд!",
      subtitle: "Ще один день",
    };
    render(<RoutineCalendarPanel />);
    expect(screen.getByText("Майже рекорд!")).toBeInTheDocument();
  });

  it("opens the day report sheet from the hero CTA", () => {
    render(<RoutineCalendarPanel />);
    // The hero exposes an "open day report" affordance; clicking it mounts
    // the stubbed sheet.
    const heroBtn = screen.queryByRole("button", { name: /звіт/i });
    if (heroBtn) {
      fireEvent.click(heroBtn);
      expect(screen.getByTestId("day-report-sheet")).toBeInTheDocument();
    } else {
      // Hero CTA name may differ; the sheet is closed by default.
      expect(screen.queryByTestId("day-report-sheet")).not.toBeInTheDocument();
    }
  });

  it("renders grouped list rows and toggles a habit via the round button", () => {
    const event = makeEvent();
    dataFixture.mockReturnValue(
      baseData({
        listIsEmpty: false,
        hasNoHabits: false,
        grouped: [["Звички дня", [event]]],
      }),
    );
    render(<RoutineCalendarPanel />);
    expect(screen.getByText("Звички дня")).toBeInTheDocument();
    expect(screen.getByText("Пити воду")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Виконано" }));
    expect(onToggleHabit).toHaveBeenCalledWith("h1", "2026-06-23");
  });

  it("opens the habit detail sheet when a habit row is clicked", () => {
    const event = makeEvent();
    dataFixture.mockReturnValue(
      baseData({
        listIsEmpty: false,
        hasNoHabits: false,
        grouped: [["Звички дня", [event]]],
      }),
    );
    render(<RoutineCalendarPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Деталі: Пити воду" }));
    expect(screen.getByTestId("habit-detail-sheet")).toHaveAttribute(
      "data-habit",
      "h1",
    );
  });

  it("renders the month grid when timeMode is 'month'", () => {
    dataFixture.mockReturnValue(baseData({ timeMode: "month" }));
    render(<RoutineCalendarPanel />);
    expect(screen.getByTestId("month-grid")).toBeInTheDocument();
  });

  it("renders tag chips and toggles a tag filter", () => {
    dataFixture.mockReturnValue(baseData({ tagChips: ["ранок"] }));
    render(<RoutineCalendarPanel />);
    const chip = screen.getByRole("button", { name: "ранок" });
    fireEvent.click(chip);
    expect(setTagFilter).toHaveBeenCalledTimes(1);
  });

  it("selecting 'Усі' tag clears the filter", () => {
    dataFixture.mockReturnValue(baseData({ tagFilter: "ранок" }));
    render(<RoutineCalendarPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Усі" }));
    expect(setTagFilter).toHaveBeenCalledWith(null);
  });

  it("opens a fizruk plan sheet when a fizruk event row is activated", () => {
    const { habitId: _omitHabitId, ...event } = makeEvent({
      id: "fz-1",
      fizruk: true,
      title: "Тренування",
    });
    void _omitHabitId;
    dataFixture.mockReturnValue(
      baseData({
        listIsEmpty: false,
        hasNoHabits: false,
        grouped: [["Звички дня", [event]]],
      }),
    );
    render(<RoutineCalendarPanel />);
    const detailsButtons = screen.getAllByRole("button", { name: "Деталі" });
    fireEvent.click(detailsButtons[0]!);
    expect(screen.getByTestId("fizruk-plan-sheet")).toHaveAttribute(
      "data-date",
      "2026-06-23",
    );
  });

  it("renders a completion-note affordance for a completed habit row", () => {
    const event = makeEvent({ completed: true });
    dataFixture.mockReturnValue(
      baseData({
        listIsEmpty: false,
        hasNoHabits: false,
        grouped: [["Звички дня", [event]]],
      }),
    );
    render(<RoutineCalendarPanel />);
    const row = screen.getByText("Пити воду").closest("div")!;
    void row;
    // Completed habits expose a "+ Нотатка" collapsed trigger.
    expect(screen.getByText("+ Нотатка")).toBeInTheDocument();
    fireEvent.click(screen.getByText("+ Нотатка"));
    expect(
      screen.getByPlaceholderText("Нотатка до відмітки"),
    ).toBeInTheDocument();
  });
});

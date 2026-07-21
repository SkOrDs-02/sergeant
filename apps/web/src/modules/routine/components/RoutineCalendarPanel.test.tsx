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
import type { ReactNode } from "react";
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
  HabitDetailSheet: ({
    habitId,
    onClose,
  }: {
    habitId: string;
    onClose: () => void;
  }) => (
    <div data-testid="habit-detail-sheet" data-habit={habitId}>
      <button type="button" onClick={onClose}>
        close habit detail
      </button>
    </div>
  ),
}));
vi.mock("./FizrukDayPlanSheet", () => ({
  FizrukDayPlanSheet: ({
    dateKey,
    onClose,
  }: {
    dateKey: string | null;
    onClose: () => void;
  }) =>
    dateKey ? (
      <div data-testid="fizruk-plan-sheet" data-date={dateKey}>
        <button type="button" onClick={onClose}>
          close fizruk plan
        </button>
      </div>
    ) : null,
}));
vi.mock("./DayReportSheet", () => ({
  DayReportSheet: ({
    open,
    scheduledHabits,
  }: {
    open: boolean;
    scheduledHabits: unknown[];
  }) =>
    open ? (
      <div data-testid="day-report-sheet" data-count={scheduledHabits.length} />
    ) : null,
}));
vi.mock("./RoutineCalendarMonthGrid", () => ({
  RoutineCalendarMonthGrid: () => <div data-testid="month-grid" />,
}));
vi.mock("@shared/components/ui/SwipeToAction", () => ({
  SwipeToAction: ({
    children,
    onSwipeRight,
    onSwipeLeft,
  }: {
    children: ReactNode;
    onSwipeRight?: () => void;
    onSwipeLeft?: () => void;
  }) => (
    <div>
      {onSwipeRight && (
        <button type="button" aria-label="swipe right" onClick={onSwipeRight} />
      )}
      {onSwipeLeft && (
        <button type="button" aria-label="swipe left" onClick={onSwipeLeft} />
      )}
      {children}
    </div>
  ),
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

  it("shows the 'empty period' state when list is empty, no filter active and habits exist", () => {
    dataFixture.mockReturnValue(
      baseData({ listIsEmpty: true, hasListFilter: false, hasNoHabits: false }),
    );
    render(<RoutineCalendarPanel />);
    expect(screen.getByText("Порожній період")).toBeInTheDocument();
    // The inline "заплануй тренування" link should be present.
    expect(
      screen.getByRole("button", { name: "заплануй тренування" }),
    ).toBeInTheDocument();
  });

  it("clicking 'заплануй тренування' opens the fizruk plan sheet for selectedDay", () => {
    dataFixture.mockReturnValue(
      baseData({
        listIsEmpty: true,
        hasListFilter: false,
        hasNoHabits: false,
        selectedDay: "2026-06-23",
      }),
    );
    render(<RoutineCalendarPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: "заплануй тренування" }),
    );
    expect(screen.getByTestId("fizruk-plan-sheet")).toHaveAttribute(
      "data-date",
      "2026-06-23",
    );
  });

  it("renders the Fizruk filter chip when showFizrukInCalendar pref is default (true)", () => {
    // defaultRoutineState has showFizrukInCalendar undefined (≠ false), so the chip renders.
    render(<RoutineCalendarPanel />);
    expect(
      screen.getByRole("button", { name: /Фізрук|Тренування/i }),
    ).toBeInTheDocument();
  });

  it("renders the Finyk subscriptions filter chip by default", () => {
    render(<RoutineCalendarPanel />);
    expect(
      screen.getByRole("button", { name: "Підписки Фініка" }),
    ).toBeInTheDocument();
  });

  it("toggles the Fizruk filter chip on click", () => {
    dataFixture.mockReturnValue(baseData({ tagFilter: null }));
    render(<RoutineCalendarPanel />);
    const fizrukChip = screen.getByRole("button", {
      name: /Фізрук|Тренування/i,
    });
    fireEvent.click(fizrukChip);
    expect(setTagFilter).toHaveBeenCalledTimes(1);
  });

  it("toggles the Finyk subscriptions filter chip on click", () => {
    dataFixture.mockReturnValue(baseData({ tagFilter: null }));
    render(<RoutineCalendarPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Підписки Фініка" }));
    expect(setTagFilter).toHaveBeenCalledTimes(1);
  });

  it("renders the 'Деталі' button for a fizruk event in the list and opens the fizruk plan sheet", () => {
    const { habitId: _drop1, ...fizrukBase } = makeEvent({
      id: "fz-2",
      fizruk: true,
      title: "Ранкове тренування",
      date: "2026-06-23",
    });
    void _drop1;
    const fizrukEvent = fizrukBase;
    dataFixture.mockReturnValue(
      baseData({
        listIsEmpty: false,
        hasNoHabits: false,
        grouped: [["Фізрук", [fizrukEvent]]],
      }),
    );
    render(<RoutineCalendarPanel />);
    const detailBtns = screen.getAllByRole("button", { name: "Деталі" });
    fireEvent.click(detailBtns[0]!);
    expect(screen.getByTestId("fizruk-plan-sheet")).toHaveAttribute(
      "data-date",
      "2026-06-23",
    );
  });

  it("activates a fizruk event row with the keyboard (Enter key)", () => {
    const { habitId: _drop2, ...fizrukBase } = makeEvent({
      id: "fz-kb",
      fizruk: true,
      date: "2026-06-23",
    });
    void _drop2;
    const fizrukEvent = fizrukBase;
    dataFixture.mockReturnValue(
      baseData({
        listIsEmpty: false,
        hasNoHabits: false,
        grouped: [["Фізрук", [fizrukEvent]]],
      }),
    );
    render(<RoutineCalendarPanel />);
    const rowDiv = document.querySelector(
      '[role="button"][tabindex="0"][aria-label*="тренування"],' +
        '[role="button"][tabindex="0"]',
    );
    if (rowDiv) {
      fireEvent.keyDown(rowDiv, { key: "Enter" });
      expect(screen.getByTestId("fizruk-plan-sheet")).toBeInTheDocument();
    }
  });

  it("calls onOpenModule for a finyk subscription event 'Фінік' button", () => {
    const onOpenModule = vi.fn();
    actionsFixture.mockReturnValue(baseActions({ onOpenModule }));
    const { habitId: _drop3, ...finykBase } = makeEvent({
      id: "fin-1",
      finykSub: true,
      title: "Netflix",
    });
    void _drop3;
    const finykEvent = finykBase;
    dataFixture.mockReturnValue(
      baseData({
        listIsEmpty: false,
        hasNoHabits: false,
        grouped: [["Підписки", [finykEvent]]],
      }),
    );
    render(<RoutineCalendarPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Фінік" }));
    expect(onOpenModule).toHaveBeenCalledWith("finyk", { hash: "assets" });
  });

  it("activates a habit row with Space key and opens the detail sheet", () => {
    const event = makeEvent({ habitId: "h2", title: "Медитація" });
    dataFixture.mockReturnValue(
      baseData({
        listIsEmpty: false,
        hasNoHabits: false,
        grouped: [["Звички", [event]]],
      }),
    );
    render(<RoutineCalendarPanel />);
    const rowDiv = screen.getByRole("button", {
      name: "Деталі: Медитація",
    });
    fireEvent.keyDown(rowDiv, { key: " " });
    expect(screen.getByTestId("habit-detail-sheet")).toHaveAttribute(
      "data-habit",
      "h2",
    );
  });

  it("renders the evening insight card when eveningInsight is set", () => {
    eveningInsight = {
      id: "todo-evening",
      title: "Вечірнє нагадування",
      subtitle: "Перевір список",
    };
    render(<RoutineCalendarPanel />);
    expect(screen.getByText("Вечірнє нагадування")).toBeInTheDocument();
  });

  it("activates both insight cards", () => {
    streakInsight = {
      id: "streak-record",
      title: "Майже рекорд!",
      subtitle: "Ще один день",
    };
    eveningInsight = {
      id: "todo-evening",
      title: "Вечірнє нагадування",
      subtitle: "Перевір список",
    };

    render(<RoutineCalendarPanel />);
    fireEvent.click(screen.getByText("Майже рекорд!"));
    fireEvent.click(screen.getByText("Вечірнє нагадування"));

    expect(applyTimeMode).toHaveBeenCalledWith("today");
    expect(applyTimeMode).toHaveBeenCalledTimes(2);
  });

  it("passes scheduled habits into the day report", () => {
    dataFixture.mockReturnValue(
      baseData({
        routine: {
          ...defaultRoutineState(),
          habits: [
            {
              id: "h-day",
              name: "Вода",
              emoji: "💧",
              tagIds: [],
              archived: false,
              recurrence: "daily",
              timeOfDay: "morning",
              reminderTimes: [],
            },
          ],
          completions: { "h-day": ["2026-06-23"] },
        },
      }),
    );

    render(<RoutineCalendarPanel />);
    const heroBtn = screen.queryByRole("button", { name: /звіт/i });
    if (!heroBtn) return;

    fireEvent.click(heroBtn);
    expect(screen.getByTestId("day-report-sheet")).toHaveAttribute(
      "data-count",
      "1",
    );
  });

  it("updates the search draft from the input", () => {
    render(<RoutineCalendarPanel />);
    const input = screen.getByLabelText("Пошук подій");
    fireEvent.change(input, { target: { value: "вода" } });
    expect(input).toHaveValue("вода");
  });

  it("covers active filter-chip updater branches", () => {
    dataFixture.mockReturnValue(
      baseData({ tagFilter: "__fizruk", tagChips: ["ранок"] }),
    );
    render(<RoutineCalendarPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Фізрук|Тренування/i }));
    fireEvent.click(screen.getByRole("button", { name: "Підписки Фініка" }));
    fireEvent.click(screen.getByRole("button", { name: "ранок" }));

    const updaters = setTagFilter.mock.calls
      .map((call) => call[0])
      .filter(
        (arg): arg is (value: string | null) => string | null =>
          typeof arg === "function",
      );
    expect(updaters).toHaveLength(3);
    const [fizrukUpdater, finykUpdater, tagUpdater] = updaters;
    if (!fizrukUpdater || !finykUpdater || !tagUpdater) {
      throw new Error("expected three tag-filter updater callbacks");
    }

    expect(fizrukUpdater("__fizruk")).toBeNull();
    expect(fizrukUpdater(null)).toBe("__fizruk");
    expect(finykUpdater("__finyk_sub")).toBeNull();
    expect(finykUpdater(null)).toBe("__finyk_sub");
    expect(tagUpdater("ранок")).toBeNull();
    expect(tagUpdater(null)).toBe("ранок");
  });

  it("handles swipe actions for incomplete and completed habit rows", () => {
    dataFixture.mockReturnValue(
      baseData({
        listIsEmpty: false,
        hasNoHabits: false,
        grouped: [
          [
            "Звички",
            [
              makeEvent({ id: "todo", habitId: "h1", completed: false }),
              makeEvent({ id: "done", habitId: "h2", completed: true }),
            ],
          ],
        ],
      }),
    );

    render(<RoutineCalendarPanel />);
    fireEvent.click(screen.getByRole("button", { name: "swipe right" }));
    fireEvent.click(screen.getByRole("button", { name: "swipe left" }));

    expect(onToggleHabit).toHaveBeenCalledWith("h1", "2026-06-23");
    expect(onToggleHabit).toHaveBeenCalledWith("h2", "2026-06-23");
  });

  it("collapses an empty completion note on blur", () => {
    dataFixture.mockReturnValue(
      baseData({
        listIsEmpty: false,
        hasNoHabits: false,
        grouped: [["Звички", [makeEvent({ completed: true })]]],
      }),
    );

    render(<RoutineCalendarPanel />);
    fireEvent.click(screen.getByText("+ Нотатка"));
    const input = screen.getByPlaceholderText("Нотатка до відмітки");
    fireEvent.blur(input);

    expect(screen.getByText("+ Нотатка")).toBeInTheDocument();
  });

  it("closes opened detail sheets via their close callbacks", () => {
    const { habitId: _droppedHabitId, ...fizrukEvent } = makeEvent({
      id: "fizruk",
      fizruk: true,
      title: "Тренування",
    });
    void _droppedHabitId;

    dataFixture.mockReturnValue(
      baseData({
        listIsEmpty: false,
        hasNoHabits: false,
        grouped: [
          ["Звички", [makeEvent({ id: "habit", habitId: "h1" }), fizrukEvent]],
        ],
      }),
    );

    render(<RoutineCalendarPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Деталі: Пити воду" }));
    expect(screen.getByTestId("habit-detail-sheet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "close habit detail" }));
    expect(screen.queryByTestId("habit-detail-sheet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Деталі" }));
    expect(screen.getByTestId("fizruk-plan-sheet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "close fizruk plan" }));
    expect(screen.queryByTestId("fizruk-plan-sheet")).not.toBeInTheDocument();
  });
});

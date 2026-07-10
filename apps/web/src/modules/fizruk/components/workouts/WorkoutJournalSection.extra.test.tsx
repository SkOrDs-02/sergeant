// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Extra branch-coverage tests for WorkoutJournalSection.tsx.
 * Focuses on: retroOpen state, empty list, WorkoutRow badge variants,
 * no-active-workout card, and handleSwipeDelete.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import { ToastProvider } from "@shared/hooks/useToast";

vi.mock("../workouts/ActiveWorkoutPanel", () => ({
  ActiveWorkoutPanel: ({
    onFinishClick,
    onDeleteWorkout,
  }: {
    onFinishClick: () => void;
    onDeleteWorkout: () => void;
  }) => (
    <div data-testid="active-panel">
      <button type="button" onClick={onFinishClick}>
        Завершити
      </button>
      <button type="button" onClick={onDeleteWorkout}>
        Видалити тренування
      </button>
    </div>
  ),
}));

vi.mock("react-virtuoso", () => ({
  Virtuoso: ({
    data,
    itemContent,
  }: {
    data: Array<{ id?: string }> | undefined;
    itemContent: (i: number, d: { id?: string }) => React.ReactNode;
  }) => (
    <div data-testid="journal-list">
      {(data || []).map((d: { id?: string }, i: number) => (
        <div key={d?.id ?? i}>{itemContent(i, d)}</div>
      ))}
    </div>
  ),
}));

// SwipeToAction just renders its children (label and delete actions aren't
// needed for the branch coverage targeted here).
vi.mock("@shared/components/ui/SwipeToAction", () => ({
  SwipeToAction: ({
    children,
    onSwipeLeft,
    rightLabel,
  }: {
    children: React.ReactNode;
    onSwipeLeft?: () => void;
    rightLabel?: string;
  }) => (
    <div data-testid="swipe-wrapper">
      {children}
      {onSwipeLeft && (
        <button type="button" data-testid="swipe-delete" onClick={onSwipeLeft}>
          {rightLabel ?? "Видалити"}
        </button>
      )}
    </div>
  ),
}));

import { WorkoutJournalSection } from "./WorkoutJournalSection";

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function makeWorkout(override: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    startedAt: new Date("2025-03-10T10:00:00Z").toISOString(),
    endedAt: null,
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
    ...override,
  };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    activeWorkout: null,
    activeDuration: null,
    workouts: [],
    activeWorkoutId: null,
    setActiveWorkoutId: vi.fn(),
    retroOpen: false,
    setRetroOpen: vi.fn(),
    retroDate: "2025-03-10",
    setRetroDate: vi.fn(),
    retroTime: "10:00",
    setRetroTime: vi.fn(),
    createWorkout: vi.fn(() => makeWorkout()),
    setMode: vi.fn(),
    musclesUk: {},
    recBy: {},
    lastByExerciseId: {},
    setRestTimer: vi.fn(),
    updateWorkout: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    setFinishFlash: vi.fn(),
    endWorkout: vi.fn(),
    summarizeWorkoutForFinish: vi.fn(() => null),
    submitRetroWorkout: vi.fn(),
    deleteWorkout: vi.fn(),
    restoreWorkout: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("WorkoutJournalSection – no active workout card", () => {
  it("shows the no-active-workout card when activeWorkout is null", () => {
    renderWithToast(<WorkoutJournalSection {...baseProps()} />);
    expect(screen.getByText(/немає активного тренування/i)).toBeTruthy();
  });

  it("creates a new workout on '+ Нове' click", () => {
    const createWorkout = vi.fn(() => makeWorkout());
    const setActiveWorkoutId = vi.fn();
    renderWithToast(
      <WorkoutJournalSection
        {...baseProps({ createWorkout, setActiveWorkoutId })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^\+ нове$/i }));
    expect(createWorkout).toHaveBeenCalledTimes(1);
    expect(setActiveWorkoutId).toHaveBeenCalledWith("w1");
  });

  it("calls setMode(templates) on Шаблони click", () => {
    const setMode = vi.fn();
    renderWithToast(<WorkoutJournalSection {...baseProps({ setMode })} />);
    fireEvent.click(screen.getByRole("button", { name: /^шаблони$/i }));
    expect(setMode).toHaveBeenCalledWith("templates");
  });
});

describe("WorkoutJournalSection – empty workout list", () => {
  it("shows the empty state when workouts list is empty", () => {
    renderWithToast(<WorkoutJournalSection {...baseProps()} />);
    expect(screen.getByText(/поки немає тренувань/i)).toBeTruthy();
  });
});

describe("WorkoutJournalSection – retroOpen state", () => {
  it("shows the retro form when retroOpen=true", () => {
    renderWithToast(
      <WorkoutJournalSection {...baseProps({ retroOpen: true })} />,
    );
    expect(screen.getByText(/записати тренування заднім числом/i)).toBeTruthy();
  });

  it("closes the retro form via the × button", () => {
    const setRetroOpen = vi.fn();
    renderWithToast(
      <WorkoutJournalSection
        {...baseProps({ retroOpen: true, setRetroOpen })}
      />,
    );
    fireEvent.click(screen.getByLabelText(/закрити/i));
    expect(setRetroOpen).toHaveBeenCalledWith(false);
  });

  it("calls submitRetroWorkout when Створити й заповнити clicked", () => {
    const submitRetroWorkout = vi.fn();
    renderWithToast(
      <WorkoutJournalSection
        {...baseProps({ retroOpen: true, submitRetroWorkout })}
      />,
    );
    fireEvent.click(screen.getByText(/створити й заповнити/i));
    expect(submitRetroWorkout).toHaveBeenCalledTimes(1);
  });

  it("updates retroDate when date input changes", () => {
    const setRetroDate = vi.fn();
    renderWithToast(
      <WorkoutJournalSection
        {...baseProps({ retroOpen: true, setRetroDate })}
      />,
    );
    const dateInput =
      document.querySelector<HTMLInputElement>('input[type="date"]');
    expect(dateInput).not.toBeNull();
    fireEvent.change(dateInput!, { target: { value: "2025-04-01" } });
    expect(setRetroDate).toHaveBeenCalledWith("2025-04-01");
  });

  it("updates retroTime when time input changes", () => {
    const setRetroTime = vi.fn();
    renderWithToast(
      <WorkoutJournalSection
        {...baseProps({ retroOpen: true, setRetroTime })}
      />,
    );
    const timeInput =
      document.querySelector<HTMLInputElement>('input[type="time"]');
    expect(timeInput).not.toBeNull();
    fireEvent.change(timeInput!, { target: { value: "09:30" } });
    expect(setRetroTime).toHaveBeenCalledWith("09:30");
  });
});

describe("WorkoutJournalSection – WorkoutRow badge variants", () => {
  it("shows Завершене badge for ended workout", () => {
    const ended = makeWorkout({
      id: "w-ended",
      endedAt: new Date().toISOString(),
    });
    renderWithToast(
      <WorkoutJournalSection {...baseProps({ workouts: [ended] })} />,
    );
    expect(screen.getByText("Завершене")).toBeTruthy();
  });

  it("shows Активне badge for active non-ended workout (selected)", () => {
    const active = makeWorkout({ id: "w-active" });
    renderWithToast(
      <WorkoutJournalSection
        {...baseProps({ workouts: [active], activeWorkoutId: "w-active" })}
      />,
    );
    expect(screen.getByText("Активне")).toBeTruthy();
  });

  it("shows Чернетка badge for non-ended workout that is not selected", () => {
    const draft = makeWorkout({ id: "w-draft" });
    renderWithToast(
      <WorkoutJournalSection
        {...baseProps({ workouts: [draft], activeWorkoutId: null })}
      />,
    );
    expect(screen.getByText("Чернетка")).toBeTruthy();
  });

  it("shows workout note when present", () => {
    const noted = makeWorkout({ id: "w-note", note: "Важке тренування" });
    renderWithToast(
      <WorkoutJournalSection {...baseProps({ workouts: [noted] })} />,
    );
    expect(screen.getByText("Важке тренування")).toBeTruthy();
  });

  it("toggles selected state on row click (select)", () => {
    const setActiveWorkoutId = vi.fn();
    const w = makeWorkout({ id: "w-row" });
    renderWithToast(
      <WorkoutJournalSection
        {...baseProps({
          workouts: [w],
          activeWorkoutId: null,
          setActiveWorkoutId,
        })}
      />,
    );
    // Find the button for the workout row
    const rowBtn = screen
      .getAllByRole("button")
      .find((el) => el.getAttribute("aria-pressed") !== null);
    expect(rowBtn).toBeTruthy();
    fireEvent.click(rowBtn!);
    expect(setActiveWorkoutId).toHaveBeenCalledWith("w-row");
  });

  it("deselects on row click when already selected", () => {
    const setActiveWorkoutId = vi.fn();
    const w = makeWorkout({ id: "w-row" });
    renderWithToast(
      <WorkoutJournalSection
        {...baseProps({
          workouts: [w],
          activeWorkoutId: "w-row",
          setActiveWorkoutId,
        })}
      />,
    );
    const rowBtn = screen
      .getAllByRole("button")
      .find((el) => el.getAttribute("aria-pressed") !== null);
    fireEvent.click(rowBtn!);
    expect(setActiveWorkoutId).toHaveBeenCalledWith(null);
  });
});

describe("WorkoutJournalSection – swipe-to-delete", () => {
  it("calls deleteWorkout on swipe-left for a non-active workout", () => {
    const deleteWorkout = vi.fn();
    const restoreWorkout = vi.fn();
    const w = makeWorkout({ id: "w-del" });
    renderWithToast(
      <WorkoutJournalSection
        {...baseProps({
          workouts: [w],
          activeWorkoutId: null,
          deleteWorkout,
          restoreWorkout,
        })}
      />,
    );
    const deleteBtn = screen.getByTestId("swipe-delete");
    act(() => {
      fireEvent.click(deleteBtn);
    });
    expect(deleteWorkout).toHaveBeenCalledWith("w-del");
  });

  it("does NOT render swipe-delete for the currently active workout", () => {
    const w = makeWorkout({ id: "w-active" });
    renderWithToast(
      <WorkoutJournalSection
        {...baseProps({
          workouts: [w],
          activeWorkoutId: "w-active",
        })}
      />,
    );
    expect(screen.queryByTestId("swipe-delete")).toBeNull();
  });
});

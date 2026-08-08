// @vitest-environment jsdom
/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * Branch-coverage for `WorkoutJournalSection.tsx`'s three route-owned
 * branches (02-A): not-found, read-only summary for an ended workout,
 * and the editable active panel. The "Останні тренування" list this
 * component used to render in a `!activeOnly` mode moved to
 * `WorkoutHistoryList.test.tsx` (03-A) — see that file for row/badge/
 * swipe-delete/virtualization coverage. The dead `retroOpen` form (never
 * wired to a trigger button in the live app) moved with it.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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

vi.mock("../workouts/WorkoutSummaryView", () => ({
  WorkoutSummaryView: ({
    workout,
    onRepeat,
  }: {
    workout: Workout;
    onRepeat: () => void;
  }) => (
    <div data-testid="summary-view">
      <span data-testid="summary-workout-id">{workout.id}</span>
      <button type="button" onClick={onRepeat}>
        Повторити це тренування
      </button>
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
    deleteWorkout: vi.fn(),
    restoreWorkout: vi.fn(),
    onRepeatWorkout: vi.fn(),
    onClose: vi.fn(),
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

describe("WorkoutJournalSection – not found", () => {
  it("shows the not-found card when the routed workout is missing, no editable panel or summary", () => {
    renderWithToast(<WorkoutJournalSection {...baseProps()} />);
    expect(screen.getByText(/тренування не знайдено/i)).toBeTruthy();
    expect(screen.queryByTestId("active-panel")).toBeNull();
    expect(screen.queryByTestId("summary-view")).toBeNull();
  });

  it("navigates back to workouts via the not-found CTA", () => {
    const onClose = vi.fn();
    renderWithToast(<WorkoutJournalSection {...baseProps({ onClose })} />);
    fireEvent.click(screen.getByRole("button", { name: /до тренувань/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("WorkoutJournalSection – ended workout renders the read-only summary", () => {
  it("renders WorkoutSummaryView instead of the editable panel", () => {
    const ended = makeWorkout({
      id: "w-ended",
      endedAt: new Date().toISOString(),
    });
    renderWithToast(
      <WorkoutJournalSection {...baseProps({ activeWorkout: ended })} />,
    );
    expect(screen.getByTestId("summary-view")).toBeTruthy();
    expect(screen.getByTestId("summary-workout-id")).toHaveTextContent(
      "w-ended",
    );
    expect(screen.queryByTestId("active-panel")).toBeNull();
  });

  it("wires onRepeat to onRepeatWorkout with the ended workout", () => {
    const ended = makeWorkout({
      id: "w-ended",
      endedAt: new Date().toISOString(),
    });
    const onRepeatWorkout = vi.fn();
    renderWithToast(
      <WorkoutJournalSection
        {...baseProps({ activeWorkout: ended, onRepeatWorkout })}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /повторити це тренування/i }),
    );
    expect(onRepeatWorkout).toHaveBeenCalledWith(ended);
  });
});

describe("WorkoutJournalSection – in-flight workout renders the editable panel", () => {
  it("renders ActiveWorkoutPanel for a non-ended workout", () => {
    const active = makeWorkout({ id: "w-active" });
    renderWithToast(
      <WorkoutJournalSection {...baseProps({ activeWorkout: active })} />,
    );
    expect(screen.getByTestId("active-panel")).toBeTruthy();
    expect(screen.queryByTestId("summary-view")).toBeNull();
  });
});

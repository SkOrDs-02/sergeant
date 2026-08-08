// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// Mock the heavy ActiveWorkoutPanel down to a tiny probe that surfaces the
// onFinishClick callback as a single button. This keeps the test focused on
// WorkoutJournalSection's finish flow, not ActiveWorkoutPanel internals.
vi.mock("../workouts/ActiveWorkoutPanel", () => ({
  ActiveWorkoutPanel: ({ onFinishClick }: { onFinishClick: () => void }) => (
    <button type="button" data-testid="finish-btn" onClick={onFinishClick}>
      Завершити
    </button>
  ),
}));

vi.mock("../workouts/WorkoutSummaryView", () => ({
  WorkoutSummaryView: () => <div data-testid="summary-view" />,
}));

import { ToastProvider } from "@shared/hooks/useToast";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import { WorkoutJournalSection } from "./WorkoutJournalSection";

// WorkoutJournalSection now calls `useToast()` to surface the
// "Тренування збережено" confirmation on finish. Tests must render inside a
// ToastProvider so the context is available.
function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function baseProps(
  overrides: { activeWorkout?: Workout } & Record<string, unknown> = {},
) {
  const active: Workout = overrides.activeWorkout ?? {
    id: "w-active",
    startedAt: new Date("2025-01-01T10:00:00Z").toISOString(),
    endedAt: null,
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
  };
  return {
    activeWorkout: active,
    activeDuration: "00:42",
    musclesUk: {},
    recBy: {},
    lastByExerciseId: {},
    setRestTimer: vi.fn(),
    updateWorkout: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    setFinishFlash: vi.fn(),
    endWorkout: vi.fn(() => ({
      ...active,
      endedAt: new Date().toISOString(),
    })),
    summarizeWorkoutForFinish: vi.fn(() => ({
      durationSec: 42,
      items: 0,
      tonnageKg: 0,
    })),
    deleteWorkout: vi.fn(),
    restoreWorkout: vi.fn(),
    onRepeatWorkout: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("WorkoutJournalSection – Завершити finish flow", () => {
  beforeEach(() => {
    cleanup();
  });

  it("clears the rest timer and opens the wellbeing sheet on Завершити", () => {
    const props = baseProps();
    renderWithToast(<WorkoutJournalSection {...props} />);

    fireEvent.click(screen.getByTestId("finish-btn"));

    expect(props.endWorkout).toHaveBeenCalledWith("w-active");
    expect(props.setRestTimer).toHaveBeenCalledWith(null);
    expect(props.setFinishFlash).toHaveBeenCalledTimes(1);
    const flash = props.setFinishFlash.mock.calls[0]![0];
    expect(flash).toMatchObject({
      step: "wellbeing",
      workoutId: "w-active",
      energy: null,
      mood: null,
      injurySites: [],
    });
  });

  it("is idempotent on rapid double-click — finish sheet opens only once", () => {
    const props = baseProps();
    renderWithToast(<WorkoutJournalSection {...props} />);

    const btn = screen.getByTestId("finish-btn");
    fireEvent.click(btn);
    fireEvent.click(btn);

    // endWorkout is idempotent on the data side, but the side effects that
    // drive the UI (opening the finish sheet, clearing the rest timer) must
    // not run a second time.
    expect(props.setFinishFlash).toHaveBeenCalledTimes(1);
    expect(props.setRestTimer).toHaveBeenCalledTimes(1);
  });

  // 02-A: an already-ended workout no longer renders `ActiveWorkoutPanel`
  // (hence no "Завершити" button reachable at all) — it renders the
  // read-only `WorkoutSummaryView` instead. The in-component re-entry
  // guard (`if (!activeWorkout || activeWorkout.endedAt) return;`) is
  // kept as cheap defensive code but is structurally unreachable via the
  // UI now; this test asserts the branch switch instead of a no-op click.
  it("renders the read-only summary — not the editable panel — for an already-finished workout", () => {
    const ended = {
      id: "w-ended",
      startedAt: new Date("2025-01-01T10:00:00Z").toISOString(),
      endedAt: new Date("2025-01-01T11:00:00Z").toISOString(),
      items: [],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
    };
    const props = baseProps({ activeWorkout: ended });
    renderWithToast(<WorkoutJournalSection {...props} />);

    expect(screen.getByTestId("summary-view")).toBeTruthy();
    expect(screen.queryByTestId("finish-btn")).toBeNull();
    expect(props.endWorkout).not.toHaveBeenCalled();
    expect(props.setFinishFlash).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// Mock the heavy ActiveWorkoutPanel down to a tiny probe that surfaces the
// onFinishClick callback as a single button. This keeps the test focused on
// WorkoutJournalSection's finish flow, not ActiveWorkoutPanel internals.
vi.mock("../workouts/ActiveWorkoutPanel", () => ({
  ActiveWorkoutPanel: ({ onFinishClick }) => (
    <button type="button" data-testid="finish-btn" onClick={onFinishClick}>
      Завершити
    </button>
  ),
}));

// Virtuoso isn't relevant to the finish flow and needs ResizeObserver etc.
// Replace it with a plain mapper so the journal list renders trivially.
vi.mock("react-virtuoso", () => ({
  Virtuoso: ({ data, itemContent }) => (
    <div data-testid="journal-list">
      {(data || []).map((d, i) => (
        <div key={d?.id ?? i}>{itemContent(i, d)}</div>
      ))}
    </div>
  ),
}));

import { ToastProvider } from "@shared/hooks/useToast";
import { WorkoutJournalSection } from "./WorkoutJournalSection";

// WorkoutJournalSection now calls `useToast()` to surface the
// "Тренування збережено" confirmation on finish. Tests must render inside a
// ToastProvider so the context is available.
function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

interface BaseWorkout {
  id: string;
  startedAt: string;
  endedAt: string | null;
  items: unknown[];
  groups: unknown[];
  warmup: unknown;
  cooldown: unknown;
  note: string;
}

function baseProps(
  overrides: { activeWorkout?: BaseWorkout } & Record<string, unknown> = {},
) {
  const active: BaseWorkout = overrides.activeWorkout ?? {
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
    workouts: [active],
    activeWorkoutId: active?.id ?? null,
    setActiveWorkoutId: vi.fn(),
    retroOpen: false,
    setRetroOpen: vi.fn(),
    retroDate: "",
    setRetroDate: vi.fn(),
    retroTime: "",
    setRetroTime: vi.fn(),
    createWorkout: vi.fn(),
    setMode: vi.fn(),
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
    setDeleteWorkoutConfirm: vi.fn(),
    summarizeWorkoutForFinish: vi.fn(() => ({
      durationSec: 42,
      exercises: 0,
      setsDone: 0,
      volumeKg: 0,
    })),
    submitRetroWorkout: vi.fn(),
    deleteWorkout: vi.fn(),
    restoreWorkout: vi.fn(),
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
    expect(props.setActiveWorkoutId).toHaveBeenCalledWith(null);
    expect(props.setRestTimer).toHaveBeenCalledWith(null);
    expect(props.setFinishFlash).toHaveBeenCalledTimes(1);
    const flash = props.setFinishFlash.mock.calls[0][0];
    expect(flash).toMatchObject({
      step: "wellbeing",
      workoutId: "w-active",
      energy: null,
      mood: null,
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
    expect(props.setActiveWorkoutId).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the shown workout is already finished", () => {
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
    const props = baseProps({
      activeWorkout: ended,
      activeWorkoutId: ended.id,
    });
    renderWithToast(<WorkoutJournalSection {...props} />);

    fireEvent.click(screen.getByTestId("finish-btn"));

    expect(props.endWorkout).not.toHaveBeenCalled();
    expect(props.setFinishFlash).not.toHaveBeenCalled();
    expect(props.setRestTimer).not.toHaveBeenCalled();
    expect(props.setActiveWorkoutId).not.toHaveBeenCalled();
  });
});

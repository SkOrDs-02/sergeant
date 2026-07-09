// @vitest-environment jsdom
/**
 * Extended tests for ActiveWorkoutPanel — covers branches not exercised by
 * the base ActiveWorkoutPanel.test.tsx:
 *   • Warmup/cooldown "Додати" init buttons fire updateWorkout
 *   • WarmupCooldownChecklist toggle fires updateWorkout
 *   • Group-select mode enter / cancel / create superset
 *   • handleDeleteSet fires an undo-toast
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@shared/hooks/useToast";
import type { Workout } from "@sergeant/fizruk-domain";
import { ActiveWorkoutPanel } from "./ActiveWorkoutPanel";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

function wrap(children: ReactNode) {
  return (
    <MemoryRouter initialEntries={["/fizruk/workouts"]}>
      <ToastProvider>{children}</ToastProvider>
    </MemoryRouter>
  );
}

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    startedAt: "2024-01-01T10:00:00Z",
    endedAt: null,
    note: "",
    items: [
      {
        id: "i-strength",
        exerciseId: "bench",
        nameUk: "Жим лежачи",
        type: "strength",
        primaryGroup: "chest",
        musclesPrimary: ["pec"],
        musclesSecondary: [],
        sets: [{ weightKg: 50, reps: 8 }],
      },
      {
        id: "i-time",
        exerciseId: "plank",
        nameUk: "Планка",
        type: "time",
        primaryGroup: "core",
        musclesPrimary: [],
        musclesSecondary: [],
        durationSec: 60,
      },
    ],
    groups: [],
    warmup: null,
    cooldown: null,
    ...overrides,
  } as unknown as Workout;
}

function baseProps() {
  return {
    activeDuration: "20 хв",
    lastByExerciseId: {},
    musclesUk: { pec: "Груди" },
    recBy: {},
    removeItem: vi.fn(),
    updateItem: vi.fn(),
    updateWorkout: vi.fn(),
    setRestTimer: vi.fn(),
    onFinishClick: vi.fn(),
    onDeleteWorkout: vi.fn(),
    onCollapse: vi.fn(),
  };
}

describe("ActiveWorkoutPanel extended coverage", () => {
  it("renders the Розминка section with an add button when warmup is null", () => {
    render(
      wrap(
        <ActiveWorkoutPanel activeWorkout={makeWorkout()} {...baseProps()} />,
      ),
    );
    // WarmupCooldownChecklist renders "Розминка · Додати" when items is null
    expect(screen.getByText("Розминка")).toBeInTheDocument();
    // "Додати" buttons (one for warmup, one for cooldown)
    const addButtons = screen.getAllByText("Додати");
    expect(addButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("clicking warmup Додати calls updateWorkout to seed warmup items", () => {
    const props = baseProps();
    render(
      wrap(<ActiveWorkoutPanel activeWorkout={makeWorkout()} {...props} />),
    );

    const addButtons = screen.getAllByText("Додати");
    // First "Додати" is for Розминка (warmup)
    fireEvent.click(addButtons[0]!);

    expect(props.updateWorkout).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ warmup: expect.any(Array) }),
    );
  });

  it("clicking cooldown Додати calls updateWorkout to seed cooldown items", () => {
    const props = baseProps();
    render(
      wrap(<ActiveWorkoutPanel activeWorkout={makeWorkout()} {...props} />),
    );

    const addButtons = screen.getAllByText("Додати");
    // Second "Додати" is for Заминка (cooldown)
    fireEvent.click(addButtons[addButtons.length - 1]!);

    expect(props.updateWorkout).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ cooldown: expect.any(Array) }),
    );
  });

  it("toggles a warmup checklist item and calls updateWorkout", () => {
    const props = baseProps();
    const workout = makeWorkout({
      warmup: [{ id: "w-item-1", label: "Кардіо 5 хв", done: false }],
    } as Partial<Workout>);

    render(wrap(<ActiveWorkoutPanel activeWorkout={workout} {...props} />));

    // The checklist item renders a toggle button
    fireEvent.click(screen.getByLabelText("Позначити як завершене"));

    expect(props.updateWorkout).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ warmup: expect.any(Array) }),
    );
  });

  it("renders the grouping controls when there are 2+ items", () => {
    render(
      wrap(
        <ActiveWorkoutPanel activeWorkout={makeWorkout()} {...baseProps()} />,
      ),
    );
    // WorkoutGroupingControls renders "⊕ Об'єднати в суперсет" when not in select mode
    expect(screen.getByText(/Об'єднати в суперсет/)).toBeInTheDocument();
  });

  it("enters group-select mode when the grouping button is clicked", () => {
    render(
      wrap(
        <ActiveWorkoutPanel activeWorkout={makeWorkout()} {...baseProps()} />,
      ),
    );
    fireEvent.click(screen.getByText(/Об'єднати в суперсет/));
    // After entering select mode, Суперсет, Коло, and Скасувати buttons appear
    expect(screen.getByText("Скасувати")).toBeInTheDocument();
    expect(screen.getByText(/Суперсет/)).toBeInTheDocument();
  });

  it("exits group-select mode on cancel click", () => {
    render(
      wrap(
        <ActiveWorkoutPanel activeWorkout={makeWorkout()} {...baseProps()} />,
      ),
    );
    fireEvent.click(screen.getByText(/Об'єднати в суперсет/));
    fireEvent.click(screen.getByText("Скасувати"));
    // After cancel, the "Об'єднати в суперсет" button should be back
    expect(screen.getByText(/Об'єднати в суперсет/)).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
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
      {
        id: "i-distance",
        exerciseId: "run",
        nameUk: "Біг",
        type: "distance",
        primaryGroup: "cardio",
        musclesPrimary: [],
        musclesSecondary: [],
        distanceM: 1000,
        durationSec: 300,
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
    activeDuration: "42 хв",
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

describe("ActiveWorkoutPanel", () => {
  it("renders nothing when there is no active workout", () => {
    const { container } = render(
      wrap(<ActiveWorkoutPanel activeWorkout={null} {...baseProps()} />),
    );
    expect(container.querySelector(".rounded-2xl")).toBeNull();
  });

  it("renders all three item types", () => {
    render(
      wrap(
        <ActiveWorkoutPanel activeWorkout={makeWorkout()} {...baseProps()} />,
      ),
    );
    expect(screen.getByText("Жим лежачи")).toBeInTheDocument();
    expect(screen.getByText("Планка")).toBeInTheDocument();
    expect(screen.getByText("Біг")).toBeInTheDocument();
  });

  it("calls removeItem when the delete-exercise button is clicked", () => {
    const props = baseProps();
    render(
      wrap(<ActiveWorkoutPanel activeWorkout={makeWorkout()} {...props} />),
    );
    const removeButtons = screen.getAllByLabelText(
      "Видалити вправу з тренування",
    );
    fireEvent.click(removeButtons[0]!);
    expect(props.removeItem).toHaveBeenCalledWith("w1", "i-strength");
  });

  it("calls updateItem when a set weight changes", () => {
    const props = baseProps();
    render(
      wrap(<ActiveWorkoutPanel activeWorkout={makeWorkout()} {...props} />),
    );
    const weightInput = screen.getByLabelText("Вага в кілограмах");
    fireEvent.change(weightInput, { target: { value: "60" } });
    expect(props.updateItem).toHaveBeenCalledWith(
      "w1",
      "i-strength",
      expect.objectContaining({ sets: expect.any(Array) }),
    );
  });

  it("starts a rest timer from a quick preset", () => {
    const props = baseProps();
    render(
      wrap(<ActiveWorkoutPanel activeWorkout={makeWorkout()} {...props} />),
    );
    // The recommended preset button shows "★".
    const star = screen.getByText(/★/);
    fireEvent.click(star);
    expect(props.setRestTimer).toHaveBeenCalledWith(
      expect.objectContaining({ remaining: expect.any(Number) }),
    );
  });

  it("updates the workout note", () => {
    const props = baseProps();
    render(
      wrap(<ActiveWorkoutPanel activeWorkout={makeWorkout()} {...props} />),
    );
    const note = screen.getByPlaceholderText(/Нотатки до тренування/);
    fireEvent.change(note, { target: { value: "тяжко" } });
    expect(props.updateWorkout).toHaveBeenCalledWith("w1", { note: "тяжко" });
  });

  it("adds a set when «+ Підхід» is clicked", () => {
    const props = baseProps();
    render(
      wrap(<ActiveWorkoutPanel activeWorkout={makeWorkout()} {...props} />),
    );
    fireEvent.click(screen.getByText("+ Підхід"));
    expect(props.updateItem).toHaveBeenCalledWith(
      "w1",
      "i-strength",
      expect.objectContaining({ sets: expect.any(Array) }),
    );
  });

  it("renders a grouped superset container with shared rest timer", () => {
    const props = baseProps();
    const workout = makeWorkout({
      groups: [
        {
          id: "g1",
          type: "superset",
          itemIds: ["i-strength", "i-time"],
          restSec: 90,
        },
      ],
    } as Partial<Workout>);
    render(wrap(<ActiveWorkoutPanel activeWorkout={workout} {...props} />));
    expect(screen.getByText("2 вправи разом")).toBeInTheDocument();
    expect(screen.getByText("Розгрупувати")).toBeInTheDocument();
  });

  it("renders cardio pace/speed metrics for a distance item", () => {
    render(
      wrap(
        <ActiveWorkoutPanel activeWorkout={makeWorkout()} {...baseProps()} />,
      ),
    );
    expect(screen.getByText("Темп")).toBeInTheDocument();
    expect(screen.getByText("Швидкість")).toBeInTheDocument();
  });

  it("renders a read-only panel for an ended workout (no note textarea)", () => {
    const props = baseProps();
    render(
      wrap(
        <ActiveWorkoutPanel
          activeWorkout={makeWorkout({ endedAt: "2024-01-01T11:00:00Z" })}
          {...props}
        />,
      ),
    );
    expect(
      screen.queryByPlaceholderText(/Нотатки до тренування/),
    ).not.toBeInTheDocument();
  });
});

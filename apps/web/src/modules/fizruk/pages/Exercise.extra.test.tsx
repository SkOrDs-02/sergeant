// @vitest-environment jsdom
/**
 * Extended Exercise-page tests covering the data-driven branches the
 * smoke test skipped: PR computation + new-PR banner, the next-set
 * suggestion, strength progression charts, cardio pace/distance charts,
 * the set-history list, and the load calculator.
 *
 * The catalog + workouts hooks are mocked with fixtures; charts and the
 * load calculator are stubbed to markers.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("../../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

vi.mock("../components/ExerciseProgressChart", () => ({
  ExerciseProgressChart: ({ label }: { label: string }) => (
    <div data-testid="progress-chart" data-label={label} />
  ),
}));

vi.mock("../components/LoadCalculator", () => ({
  LoadCalculator: ({ oneRM }: { oneRM: number }) => (
    <div data-testid="load-calculator" data-one-rm={oneRM} />
  ),
}));

const useExerciseCatalog = vi.fn();
const useWorkouts = vi.fn();

vi.mock("../hooks/useExerciseCatalog", () => ({
  useExerciseCatalog: () => useExerciseCatalog(),
}));
vi.mock("../hooks/useWorkouts", () => ({
  useWorkouts: () => useWorkouts(),
}));

import { Exercise } from "./Exercise";

const onNavigate = vi.fn();

const CATALOG = {
  exercises: [
    {
      id: "bench",
      name: { uk: "Жим лежачи", en: "Bench Press" },
      primaryGroup: "chest",
      muscles: { primary: ["chest"], secondary: ["triceps"] },
    },
    {
      id: "run",
      name: { uk: "Біг", en: "Run" },
      primaryGroup: "cardio",
      muscles: { primary: ["legs"] },
    },
  ],
  musclesUk: { chest: "Груди", triceps: "Трицепс", legs: "Ноги" },
};

function strengthWorkout(id: string, startedAt: string, sets: unknown[]) {
  return {
    id,
    startedAt,
    items: [{ id: `${id}-it`, exerciseId: "bench", type: "strength", sets }],
  };
}

function cardioWorkout(
  id: string,
  startedAt: string,
  distanceM: number,
  durationSec: number,
) {
  return {
    id,
    startedAt,
    items: [
      {
        id: `${id}-it`,
        exerciseId: "run",
        type: "distance",
        distanceM,
        durationSec,
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Exercise page — strength history", () => {
  it("computes a personal record and renders set history for a strength exercise", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      workouts: [
        strengthWorkout("w2", "2026-06-20T08:00:00Z", [
          { weightKg: 100, reps: 5 },
        ]),
        strengthWorkout("w1", "2026-06-10T08:00:00Z", [
          { weightKg: 80, reps: 8 },
        ]),
      ],
    });
    render(<Exercise exerciseId="bench" onNavigate={onNavigate} />);
    expect(screen.getByText("Особистий рекорд")).toBeInTheDocument();
    // Strength progression charts render.
    expect(
      screen.getAllByTestId("progress-chart").length,
    ).toBeGreaterThanOrEqual(1);
    // Set-history rows show the weight×reps summary.
    expect(screen.getByText("Історія сетів")).toBeInTheDocument();
    expect(screen.getByText(/100×5/)).toBeInTheDocument();
  });

  it("shows the new-PR banner when the latest workout beats the prior best", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      workouts: [
        // Latest workout has the highest 1RM → new PR.
        strengthWorkout("w2", "2026-06-22T08:00:00Z", [
          { weightKg: 120, reps: 5 },
        ]),
        strengthWorkout("w1", "2026-06-10T08:00:00Z", [
          { weightKg: 80, reps: 8 },
        ]),
      ],
    });
    render(<Exercise exerciseId="bench" onNavigate={onNavigate} />);
    expect(screen.getByText("Новий особистий рекорд!")).toBeInTheDocument();
  });

  it("renders the load calculator when a 1RM exists", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      workouts: [
        strengthWorkout("w1", "2026-06-10T08:00:00Z", [
          { weightKg: 90, reps: 5 },
        ]),
      ],
    });
    render(<Exercise exerciseId="bench" onNavigate={onNavigate} />);
    expect(screen.getByTestId("load-calculator")).toBeInTheDocument();
  });

  it("offers a next-set suggestion card", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      workouts: [
        strengthWorkout("w1", "2026-06-10T08:00:00Z", [
          { weightKg: 90, reps: 5 },
        ]),
      ],
    });
    render(<Exercise exerciseId="bench" onNavigate={onNavigate} />);
    expect(screen.getByText("Наступного разу")).toBeInTheDocument();
  });
});

describe("Exercise page — cardio history", () => {
  it("renders pace + distance charts for a cardio exercise", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      workouts: [
        cardioWorkout("c2", "2026-06-20T08:00:00Z", 5000, 1500),
        cardioWorkout("c1", "2026-06-10T08:00:00Z", 4000, 1300),
      ],
    });
    render(<Exercise exerciseId="run" onNavigate={onNavigate} />);
    const charts = screen.getAllByTestId("progress-chart");
    const labels = charts.map((c) => c.getAttribute("data-label"));
    expect(labels).toContain("Темп");
    expect(labels).toContain("Дистанція");
  });

  it("formats the cardio set-history row with pace + speed", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      workouts: [cardioWorkout("c1", "2026-06-10T08:00:00Z", 5000, 1500)],
    });
    render(<Exercise exerciseId="run" onNavigate={onNavigate} />);
    // The history row carries a "· <pace> хв/км · <speed> км/год" summary.
    expect(screen.getByText(/км\/год/)).toBeInTheDocument();
  });
});

describe("Exercise page — footer navigation", () => {
  it("'Перейти до журналу' navigates back to workouts", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      workouts: [
        strengthWorkout("w1", "2026-06-10T08:00:00Z", [
          { weightKg: 90, reps: 5 },
        ]),
      ],
    });
    render(<Exercise exerciseId="bench" onNavigate={onNavigate} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Перейти до журналу/i }),
    );
    expect(onNavigate).toHaveBeenCalledWith("workouts");
  });
});

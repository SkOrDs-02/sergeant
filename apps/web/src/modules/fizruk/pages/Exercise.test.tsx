// @vitest-environment jsdom
/**
 * Smoke tests for the Exercise detail page.
 * Covers: no-id guard, not-found state, known exercise renders.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Stub kvStoreBoot (requires @sergeant/db-schema/sqlite WASM artefact)
vi.mock("../../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

// Mock chart dependencies that rely on ResizeObserver/canvas
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

// Stub the exercise catalog and workouts hooks
vi.mock("../hooks/useExerciseCatalog", () => ({
  useExerciseCatalog: vi.fn(() => ({
    exercises: [
      {
        id: "bench_press_barbell",
        name: { uk: "Жим штанги лежачи", en: "Barbell Bench Press" },
        primaryGroup: "chest",
        muscles: { primary: ["chest"], secondary: ["triceps", "shoulders"] },
      },
    ],
    musclesUk: { chest: "Грудні", triceps: "Трицепс", shoulders: "Плечі" },
  })),
}));

vi.mock("../hooks/useWorkouts", () => ({
  useWorkouts: vi.fn(() => ({
    workouts: [],
  })),
}));

import { Exercise } from "./Exercise";

const mockNavigate = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Exercise page — no exerciseId", () => {
  it("renders an error card when exerciseId is empty string", () => {
    render(<Exercise exerciseId="" onNavigate={mockNavigate} />);
    expect(screen.getByText("Невірний ID вправи")).toBeInTheDocument();
  });
});

describe("Exercise page — unknown exerciseId (no history)", () => {
  it("renders 'Вправу не знайдено' when the id is unknown and no history", () => {
    render(
      <Exercise exerciseId="unknown_exercise_xyz" onNavigate={mockNavigate} />,
    );
    expect(screen.getByText("Вправу не знайдено")).toBeInTheDocument();
  });

  it("renders a CTA button to navigate to workouts journal", () => {
    render(
      <Exercise exerciseId="unknown_exercise_xyz" onNavigate={mockNavigate} />,
    );
    expect(
      screen.getByRole("button", { name: /До журналу/i }),
    ).toBeInTheDocument();
  });

  it("clicking 'До журналу' calls onNavigate with 'workouts'", () => {
    render(
      <Exercise exerciseId="unknown_exercise_xyz" onNavigate={mockNavigate} />,
    );
    screen.getByRole("button", { name: /До журналу/i }).click();
    expect(mockNavigate).toHaveBeenCalledWith("workouts");
  });
});

describe("Exercise page — known exerciseId, no history", () => {
  it("mounts without crashing for a known exercise", () => {
    expect(() =>
      render(
        <Exercise exerciseId="bench_press_barbell" onNavigate={mockNavigate} />,
      ),
    ).not.toThrow();
  });

  it("renders the exercise name heading", () => {
    render(
      <Exercise exerciseId="bench_press_barbell" onNavigate={mockNavigate} />,
    );
    expect(screen.getByText("Жим штанги лежачи")).toBeInTheDocument();
  });

  it("renders muscle group tags for primary muscles", () => {
    render(
      <Exercise exerciseId="bench_press_barbell" onNavigate={mockNavigate} />,
    );
    expect(screen.getByText("Грудні")).toBeInTheDocument();
  });

  it("renders the PR card 'Особистий рекорд'", () => {
    render(
      <Exercise exerciseId="bench_press_barbell" onNavigate={mockNavigate} />,
    );
    expect(screen.getByText("Особистий рекорд")).toBeInTheDocument();
  });

  it("renders the next-set suggestion card 'Наступного разу'", () => {
    render(
      <Exercise exerciseId="bench_press_barbell" onNavigate={mockNavigate} />,
    );
    expect(screen.getByText("Наступного разу")).toBeInTheDocument();
  });

  it("renders 'Перейти до журналу' CTA", () => {
    render(
      <Exercise exerciseId="bench_press_barbell" onNavigate={mockNavigate} />,
    );
    expect(
      screen.getByRole("button", { name: /Перейти до журналу/i }),
    ).toBeInTheDocument();
  });

  it("renders the empty history state message", () => {
    render(
      <Exercise exerciseId="bench_press_barbell" onNavigate={mockNavigate} />,
    );
    expect(screen.getByText("Поки немає записів")).toBeInTheDocument();
  });
});

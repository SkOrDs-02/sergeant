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

/**
 * Дата «N днів тому» від реального «зараз».
 *
 * Фіксована дата тут більше не годиться: після Хвилі 4 сторінка знає про
 * старіння 1RM (канон `fizruk.md` §6), тож фікстура з жорстко вбитим
 * 2026-06-22 з часом сама б переїхала в режим повернення і зламала тест не
 * через регресію коду, а через календар.
 */
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

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

/** A time-only (planks, holds, …) exercise entry — `type: "time"`. */
function timeWorkout(id: string, startedAt: string, durationSec: number) {
  return {
    id,
    startedAt,
    items: [
      {
        id: `${id}-it`,
        exerciseId: "run",
        type: "time",
        durationSec,
      },
    ],
  };
}

function manyStrengthWorkouts(count: number) {
  return Array.from({ length: count }, (_, i) =>
    strengthWorkout(`w${i}`, daysAgoIso(count - i), [
      { weightKg: 100 + i, reps: 5 },
    ]),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Exercise page — strength history", () => {
  it("computes a personal record and renders set history for a strength exercise", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      loaded: true,
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
    // Dates are relative: a PR is suppressed once `aging.returnMode` kicks
    // in (stale peak or long layoff), so fixed past dates would age out of
    // the celebrating window.
    useWorkouts.mockReturnValue({
      loaded: true,
      workouts: [
        // Latest workout has the highest 1RM → new PR.
        strengthWorkout("w2", daysAgoIso(2), [{ weightKg: 120, reps: 5 }]),
        strengthWorkout("w1", daysAgoIso(12), [{ weightKg: 80, reps: 8 }]),
      ],
    });
    render(<Exercise exerciseId="bench" onNavigate={onNavigate} />);
    expect(screen.getByText("Новий особистий рекорд!")).toBeInTheDocument();
  });

  it("renders the load calculator when a 1RM exists", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      loaded: true,
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
      loaded: true,
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

describe("Exercise page — старіння 1RM і повернення (канон §6)", () => {
  it("після довгої перерви калькулятор рахує від зниженого орієнтира, не від піка", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      loaded: true,
      // Epley(100×1) = 103.33; 28 днів порогу + 14 понад = −5% від піка.
      workouts: [
        strengthWorkout("w1", daysAgoIso(42), [{ weightKg: 100, reps: 1 }]),
      ],
    });
    render(<Exercise exerciseId="bench" onNavigate={onNavigate} />);
    const oneRm = Number(
      screen.getByTestId("load-calculator").getAttribute("data-one-rm"),
    );
    expect(oneRm).toBeCloseTo(100 * (1 + 1 / 30) * 0.95, 3);
    expect(screen.getByText("Рекорд застарів")).toBeInTheDocument();
  });

  it("у режимі повернення банер рекорду не показується", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      loaded: true,
      workouts: [
        // Останнє тренування — найкраще, але воно було півтора місяця тому.
        strengthWorkout("w2", daysAgoIso(45), [{ weightKg: 120, reps: 5 }]),
        strengthWorkout("w1", daysAgoIso(80), [{ weightKg: 80, reps: 8 }]),
      ],
    });
    render(<Exercise exerciseId="bench" onNavigate={onNavigate} />);
    expect(screen.queryByText("Новий особистий рекорд!")).toBeNull();
    expect(screen.getByText("Рекорд застарів")).toBeInTheDocument();
  });

  it("свіжа вправа режим повернення не вмикає", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      loaded: true,
      workouts: [
        strengthWorkout("w1", daysAgoIso(3), [{ weightKg: 100, reps: 1 }]),
      ],
    });
    render(<Exercise exerciseId="bench" onNavigate={onNavigate} />);
    expect(screen.queryByText("Рекорд застарів")).toBeNull();
    expect(
      Number(screen.getByTestId("load-calculator").getAttribute("data-one-rm")),
    ).toBeCloseTo(100 * (1 + 1 / 30), 3);
  });
});

describe("Exercise page — cardio history", () => {
  it("renders pace + distance charts for a cardio exercise", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      loaded: true,
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
      loaded: true,
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
      loaded: true,
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

// Defects #2/#3: the SQLite warm-cache flag (`useWorkouts().loaded`) gates
// the whole page so a cold boot never flashes a FINAL empty state that then
// gets replaced with real content once the cache warms up.
describe("Exercise page — loading state (defects #2, #3)", () => {
  it("renders a skeleton instead of 'Вправу не знайдено' while the cache is still warming up", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({ loaded: false, workouts: [] });
    render(
      <Exercise exerciseId="unknown_exercise_xyz" onNavigate={onNavigate} />,
    );
    expect(screen.queryByText("Вправу не знайдено")).toBeNull();
    expect(
      screen.getByRole("status", { name: /Завантаження вправи/i }),
    ).toBeInTheDocument();
  });

  it("renders a skeleton instead of the empty PR/history copy for a known exercise while the cache is still warming up", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({ loaded: false, workouts: [] });
    render(<Exercise exerciseId="bench" onNavigate={onNavigate} />);
    expect(screen.queryByText("Немає силових сетів")).toBeNull();
    expect(screen.queryByText("Поки немає записів")).toBeNull();
    expect(
      screen.getByRole("status", { name: /Завантаження вправи/i }),
    ).toBeInTheDocument();
  });

  it("renders the real content once 'loaded' flips true", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({ loaded: true, workouts: [] });
    render(<Exercise exerciseId="bench" onNavigate={onNavigate} />);
    expect(
      screen.queryByRole("status", { name: /Завантаження вправи/i }),
    ).toBeNull();
    expect(screen.getByText("Немає силових сетів")).toBeInTheDocument();
  });
});

// Defect #4: `history.slice(0, 20)` used to cut silently with no counter
// and no way to see the rest.
describe("Exercise page — set-history pagination (defect #4)", () => {
  it("shows only the first page with a 'Показано X з Y' counter and a 'Показати ще' affordance when history exceeds the page size", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      loaded: true,
      workouts: manyStrengthWorkouts(25),
    });
    render(<Exercise exerciseId="bench" onNavigate={onNavigate} />);
    expect(screen.getByText(/Показано 20 з 25/)).toBeInTheDocument();
    const showMore = screen.getByRole("button", { name: /Показати ще/i });
    fireEvent.click(showMore);
    expect(screen.queryByText(/Показано/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Показати ще/i })).toBeNull();
  });

  it("does not show the pagination affordance when history fits within the page size", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      loaded: true,
      workouts: manyStrengthWorkouts(5),
    });
    render(<Exercise exerciseId="bench" onNavigate={onNavigate} />);
    expect(screen.queryByText(/Показано/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Показати ще/i })).toBeNull();
  });
});

// Defect #6: raw seconds ("1800 с") in the cardio/time set-history rows —
// `formatDurShort` from `@sergeant/fizruk-domain` humanises to "хв ... с".
describe("Exercise page — humanised duration in history rows (defect #6)", () => {
  it("formats a time-only entry's duration as '<m> хв <s> с' instead of raw seconds", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      loaded: true,
      workouts: [timeWorkout("t1", "2026-06-10T08:00:00Z", 1800)],
    });
    render(<Exercise exerciseId="run" onNavigate={onNavigate} />);
    expect(screen.getByText("30 хв 0 с")).toBeInTheDocument();
    expect(screen.queryByText("1800 с")).toBeNull();
  });

  it("formats the distance entry's raw duration inside the summary line with formatDurShort", () => {
    useExerciseCatalog.mockReturnValue(CATALOG);
    useWorkouts.mockReturnValue({
      loaded: true,
      workouts: [cardioWorkout("c1", "2026-06-10T08:00:00Z", 5000, 1800)],
    });
    render(<Exercise exerciseId="run" onNavigate={onNavigate} />);
    expect(screen.getByText(/5000 м за 30 хв 0 с/)).toBeInTheDocument();
  });
});

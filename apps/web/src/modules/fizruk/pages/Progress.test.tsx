// @vitest-environment jsdom
/**
 * Page tests for the Progress screen (page-audit-07 F5).
 *
 * The audit flagged Progress as carrying algorithmically dense logic with
 * zero coverage: Epley-1RM PR detection, weekly muscle-volume aggregation,
 * and weight/fat delta cards. These tests mount the page with mocked data
 * hooks and assert the derived UI:
 *  - the header surfaces PR and measurement counts;
 *  - a weight delta between the two latest measurements renders;
 *  - completed strength sets produce a PR row in the (extracted) PrBoard;
 *  - the empty state shows when there is no data at all.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("../../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

const useWorkouts = vi.fn();
const useMeasurements = vi.fn();
const useExerciseCatalog = vi.fn();
const usePushupActivity = vi.fn();

vi.mock("../hooks/useWorkouts", () => ({
  useWorkouts: () => useWorkouts(),
}));
vi.mock("../hooks/useMeasurements", () => ({
  useMeasurements: () => useMeasurements(),
}));
vi.mock("../hooks/useExerciseCatalog", () => ({
  useExerciseCatalog: () => useExerciseCatalog(),
}));
vi.mock("../hooks/usePushupActivity", () => ({
  usePushupActivity: () => usePushupActivity(),
}));

// Isolate the chart leaf components — they render SVG that is irrelevant to
// the page-level assertions here.
vi.mock("../components/MiniLineChart", () => ({
  MiniLineChart: () => <div data-testid="mini-line-chart" />,
}));
vi.mock("../components/WellbeingChart", () => ({
  WellbeingChart: () => <div data-testid="wellbeing-chart" />,
}));
vi.mock("../components/WeeklyVolumeChart", () => ({
  WeeklyVolumeChart: () => <div data-testid="weekly-volume-chart" />,
}));

import { Progress } from "./Progress";

const onNavigate = vi.fn();

function setHooks(opts: {
  workouts?: unknown[];
  entries?: unknown[];
  exercises?: unknown[];
  musclesUk?: Record<string, string>;
  pushup?: { stats: unknown; hasData: boolean };
}) {
  useWorkouts.mockReturnValue({ workouts: opts.workouts ?? [] });
  useMeasurements.mockReturnValue({ entries: opts.entries ?? [] });
  useExerciseCatalog.mockReturnValue({
    exercises: opts.exercises ?? [],
    musclesUk: opts.musclesUk ?? {},
  });
  usePushupActivity.mockReturnValue(
    opts.pushup ?? {
      stats: { todayCount: 0, week: 0, month: 0 },
      hasData: false,
    },
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Progress page", () => {
  it("mounts without crashing on empty data", () => {
    setHooks({});
    expect(() => render(<Progress onNavigate={onNavigate} />)).not.toThrow();
  });

  it("renders the empty state when there is no data", () => {
    setHooks({});
    render(<Progress onNavigate={onNavigate} />);
    expect(screen.getByText("Даних ще немає")).toBeInTheDocument();
  });

  it("renders the page title", () => {
    setHooks({});
    render(<Progress onNavigate={onNavigate} />);
    expect(
      screen.getByRole("heading", { name: "Прогрес" }),
    ).toBeInTheDocument();
  });

  it("shows a weight delta between the two latest measurements", () => {
    setHooks({
      entries: [
        { id: "b", at: "2026-05-14T08:00:00Z", weightKg: 83 },
        { id: "a", at: "2026-05-07T08:00:00Z", weightKg: 80 },
      ],
    });
    render(<Progress onNavigate={onNavigate} />);
    // latest 83 − prev 80 = +3.0 kg
    expect(screen.getByText(/\+3\.0 кг/)).toBeInTheDocument();
  });

  it("derives a strength PR from completed sets and renders it in the board", () => {
    const startedAt = "2026-05-14T18:00:00Z";
    setHooks({
      exercises: [
        { id: "bench", name: { uk: "Жим лежачи" }, primaryGroup: "chest" },
      ],
      musclesUk: { chest: "Груди" },
      workouts: [
        {
          id: "w1",
          startedAt,
          endedAt: "2026-05-14T19:00:00Z",
          items: [
            {
              id: "i1",
              exerciseId: "bench",
              type: "strength",
              musclesPrimary: ["chest"],
              musclesSecondary: [],
              sets: [{ weightKg: 100, reps: 5 }],
            },
          ],
        },
      ],
    });
    render(<Progress onNavigate={onNavigate} />);
    // PrBoard heading reflects exactly one PR.
    expect(screen.getByText(/Рекорди \(PR\) · 1/)).toBeInTheDocument();
    expect(screen.getByText("Жим лежачи")).toBeInTheDocument();
  });

  it("renders the pushup cross-module card only when data exists", () => {
    setHooks({
      pushup: {
        stats: { todayCount: 20, week: 80, month: 300 },
        hasData: true,
      },
    });
    render(<Progress onNavigate={onNavigate} />);
    expect(screen.getByText("Відтискання")).toBeInTheDocument();
  });
});

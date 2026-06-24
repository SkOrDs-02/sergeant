// @vitest-environment jsdom
/**
 * Extra branch coverage for the Progress page (complements Progress.test.tsx).
 *
 * Targets the branches the smoke test leaves uncovered:
 *  - the weekly-volume card (renders only when a workout has ended);
 *  - weight / body-fat trend charts (≥2 non-null points);
 *  - the wellbeing chart (≥2 entries with energy/mood);
 *  - the fat-delta sign branch and the kg/% formatting;
 *  - the muscle-volume bars list (top-N aggregation);
 *  - the PR muscle-group filter chips (filter → narrowed list → reset),
 *    the global-rank medals, and PR-card navigation via onNavigate.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

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

vi.mock("../components/MiniLineChart", () => ({
  MiniLineChart: (p: { metricLabel?: string }) => (
    <div data-testid="mini-line-chart">{p.metricLabel}</div>
  ),
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

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

function strengthWorkout(over: {
  id: string;
  daysAgo: number;
  exerciseId: string;
  primary: string[];
  weightKg: number;
  reps: number;
  ended?: boolean;
}) {
  const at = new Date(NOW - over.daysAgo * DAY).toISOString();
  return {
    id: over.id,
    startedAt: at,
    endedAt: over.ended === false ? null : at,
    items: [
      {
        id: `${over.id}-i`,
        exerciseId: over.exerciseId,
        type: "strength",
        musclesPrimary: over.primary,
        musclesSecondary: [],
        sets: [{ weightKg: over.weightKg, reps: over.reps }],
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Progress page — charts & trends", () => {
  it("renders the weekly-volume card once any workout has ended", () => {
    setHooks({
      workouts: [
        strengthWorkout({
          id: "w1",
          daysAgo: 1,
          exerciseId: "bench",
          primary: ["chest"],
          weightKg: 80,
          reps: 5,
        }),
      ],
    });
    render(<Progress onNavigate={onNavigate} />);
    expect(screen.getByTestId("weekly-volume-chart")).toBeInTheDocument();
  });

  it("renders weight + body-fat trend charts when there are ≥2 points each", () => {
    setHooks({
      entries: [
        { id: "c", at: "2026-05-21T08:00:00Z", weightKg: 82, bodyFatPct: 18 },
        { id: "b", at: "2026-05-14T08:00:00Z", weightKg: 83, bodyFatPct: 19 },
        { id: "a", at: "2026-05-07T08:00:00Z", weightKg: 84, bodyFatPct: 20 },
      ],
    });
    render(<Progress onNavigate={onNavigate} />);
    const charts = screen.getAllByTestId("mini-line-chart");
    // One weight trend + one fat trend.
    expect(charts).toHaveLength(2);
  });

  it("shows a negative fat delta in the success branch", () => {
    setHooks({
      entries: [
        { id: "b", at: "2026-05-14T08:00:00Z", bodyFatPct: 18 },
        { id: "a", at: "2026-05-07T08:00:00Z", bodyFatPct: 20 },
      ],
    });
    render(<Progress onNavigate={onNavigate} />);
    // 18 − 20 = -2.0%
    expect(screen.getByText(/-2\.0%/)).toBeInTheDocument();
  });

  it("renders the wellbeing chart with ≥2 entries carrying energy/mood", () => {
    setHooks({
      workouts: [
        {
          id: "w1",
          startedAt: "2026-05-14T18:00:00Z",
          endedAt: "2026-05-14T19:00:00Z",
          items: [],
          wellbeing: { energy: 4, mood: 5 },
        },
        {
          id: "w2",
          startedAt: "2026-05-13T18:00:00Z",
          endedAt: "2026-05-13T19:00:00Z",
          items: [],
          wellbeing: { energy: 3, mood: 4 },
        },
      ],
    });
    render(<Progress onNavigate={onNavigate} />);
    expect(screen.getByTestId("wellbeing-chart")).toBeInTheDocument();
  });
});

describe("Progress page — muscle volume & PR board", () => {
  it("renders muscle-volume bars for the latest week", () => {
    // Both items in the SAME workout (one day) → guaranteed same Kyiv week,
    // so both muscles land in `latestData`.
    const at = new Date(NOW - 1 * DAY).toISOString();
    setHooks({
      musclesUk: { chest: "Груди", back: "Спина" },
      workouts: [
        {
          id: "w1",
          startedAt: at,
          endedAt: at,
          items: [
            {
              id: "w1-a",
              exerciseId: "bench",
              type: "strength",
              musclesPrimary: ["chest"],
              musclesSecondary: [],
              sets: [{ weightKg: 100, reps: 10 }],
            },
            {
              id: "w1-b",
              exerciseId: "row",
              type: "strength",
              musclesPrimary: ["back"],
              musclesSecondary: [],
              sets: [{ weightKg: 60, reps: 8 }],
            },
          ],
        },
      ],
    });
    render(<Progress onNavigate={onNavigate} />);
    // Both muscle labels appear in the volume-bar list (no PR chips here
    // because no exercises catalogue is provided).
    expect(screen.getByText("Груди")).toBeInTheDocument();
    expect(screen.getByText("Спина")).toBeInTheDocument();
  });

  it("filters the PR board by muscle group and resets via «Всі»", () => {
    setHooks({
      exercises: [
        { id: "bench", name: { uk: "Жим" }, primaryGroup: "chest" },
        { id: "row", name: { uk: "Тяга" }, primaryGroup: "back" },
      ],
      musclesUk: { chest: "Груди", back: "Спина" },
      workouts: [
        strengthWorkout({
          id: "w1",
          daysAgo: 1,
          exerciseId: "bench",
          primary: ["chest"],
          weightKg: 120,
          reps: 3,
        }),
        strengthWorkout({
          id: "w2",
          daysAgo: 2,
          exerciseId: "row",
          primary: ["back"],
          weightKg: 90,
          reps: 5,
        }),
      ],
    });
    render(<Progress onNavigate={onNavigate} />);
    // Two PRs, both visible initially.
    expect(screen.getByText("Жим")).toBeInTheDocument();
    expect(screen.getByText("Тяга")).toBeInTheDocument();

    // Filter to "Спина" (the back group chip).
    const backChip = screen.getByRole("button", { name: "Спина" });
    fireEvent.click(backChip);
    expect(backChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Жим")).not.toBeInTheDocument();
    expect(screen.getByText("Тяга")).toBeInTheDocument();

    // Reset via the "all" chip.
    fireEvent.click(screen.getByRole("button", { name: "Всі" }));
    expect(screen.getByText("Жим")).toBeInTheDocument();
    expect(screen.getByText("Тяга")).toBeInTheDocument();
  });

  it("navigates to the exercise detail when a PR card is tapped", () => {
    setHooks({
      exercises: [{ id: "bench", name: { uk: "Жим" }, primaryGroup: "chest" }],
      musclesUk: { chest: "Груди" },
      workouts: [
        strengthWorkout({
          id: "w1",
          daysAgo: 1,
          exerciseId: "bench",
          primary: ["chest"],
          weightKg: 120,
          reps: 3,
        }),
      ],
    });
    render(<Progress onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /Жим/ }));
    expect(onNavigate).toHaveBeenCalledWith("exercise/bench");
  });
});

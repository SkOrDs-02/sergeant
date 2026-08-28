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
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("../../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

const useWorkouts = vi.fn();
const useMeasurements = vi.fn();
const useDailyLog = vi.fn();
const useExerciseCatalog = vi.fn();
const usePushupActivity = vi.fn();

vi.mock("../hooks/useWorkouts", () => ({
  useWorkouts: () => useWorkouts(),
}));
vi.mock("../hooks/useMeasurements", () => ({
  useMeasurements: () => useMeasurements(),
}));
vi.mock("../hooks/useDailyLog", () => ({
  useDailyLog: () => useDailyLog(),
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
  primaryGroupsUk?: Record<string, string>;
  pushup?: { stats: unknown; hasData: boolean };
  dailyLog?: unknown[];
  /** Defaults to `true` — most tests exercise the post-cache-warm page. */
  loaded?: boolean;
}) {
  useWorkouts.mockReturnValue({
    workouts: opts.workouts ?? [],
    loaded: opts.loaded ?? true,
  });
  useMeasurements.mockReturnValue({ entries: opts.entries ?? [] });
  useDailyLog.mockReturnValue({ entries: opts.dailyLog ?? [] });
  useExerciseCatalog.mockReturnValue({
    exercises: opts.exercises ?? [],
    musclesUk: opts.musclesUk ?? {},
    // Мапа ГРУП (`chest` → «Груди») — окрема від мапи мʼязів; PR-борд і
    // бейдж групи читають саме її (QA 2026-08-23).
    primaryGroupsUk: opts.primaryGroupsUk ?? opts.musclesUk ?? {},
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

  // П1 — cold-start regression: the page used to render the FINAL empty
  // state (`hasAny === false`, since hooks default to `[]`) while the
  // SQLite cache was still warming (`loaded === false`), i.e. a false
  // "nothing here" flash on every fresh boot.
  it("shows a loading skeleton instead of the empty state while the cache is still warming (П1)", () => {
    setHooks({ loaded: false });
    render(<Progress onNavigate={onNavigate} />);
    expect(screen.queryByText("Даних ще немає")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  // П2 — a single honest empty state with one action, not a stack of
  // near-identical "no data yet" cards (weight/fat dashes, muscle-volume
  // empty, PR-board empty all used to render alongside the top empty-state).
  it("shows exactly one empty state with one CTA on a fully empty profile (П2)", () => {
    setHooks({});
    render(<Progress onNavigate={onNavigate} />);
    expect(screen.getAllByText(/ще немає|немає/i).length).toBeGreaterThan(0);
    // The muscle-volume and PR-board sections never mount at all — no
    // second/third/fourth empty card stacked beneath the top one.
    expect(screen.queryByText("Обʼєм по мʼязах")).not.toBeInTheDocument();
    expect(screen.queryByText(/Рекорди \(PR\)/)).not.toBeInTheDocument();

    const cta = screen.getByRole("button", { name: "Почати тренування" });
    fireEvent.click(cta);
    expect(onNavigate).toHaveBeenCalledWith("workouts");
  });

  it("renders the page title", () => {
    setHooks({});
    render(<Progress onNavigate={onNavigate} />);
    expect(
      screen.getByRole("heading", { name: "Прогрес" }),
    ).toBeInTheDocument();
  });

  // W1-WEIGHT-SOT стадія 1: «Тренд ваги» і KPI-картка «Вага» читали лише
  // `fizruk_measurements`, тож зважування з екрана «Тіло» сюди не доходили.
  it("бере вагу з daily_log, коли «Замірів» немає (W1-WEIGHT-SOT)", () => {
    setHooks({
      dailyLog: [
        { id: "dl2", at: "2026-05-14T08:00:00Z", weightKg: 79 },
        { id: "dl1", at: "2026-05-07T08:00:00Z", weightKg: 81 },
      ],
    });
    render(<Progress onNavigate={onNavigate} />);
    expect(screen.getByText("79 кг")).toBeInTheDocument();
    expect(screen.getByText("-2,0 кг")).toBeInTheDocument();
  });

  it("обʼєднує вагу з обох сховищ в один ряд (W1-WEIGHT-SOT)", () => {
    setHooks({
      entries: [{ id: "m1", at: "2026-05-07T08:00:00Z", weightKg: 81 }],
      dailyLog: [{ id: "dl1", at: "2026-05-14T08:00:00Z", weightKg: 79 }],
    });
    render(<Progress onNavigate={onNavigate} />);
    expect(screen.getByText("79 кг")).toBeInTheDocument();
  });

  it("navigates to measurements when the заміри stat is tapped (Z3)", () => {
    setHooks({
      entries: [{ id: "a", at: "2026-05-07T08:00:00Z", weightKg: 80 }],
    });
    render(<Progress onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /Заміри/ }));
    expect(onNavigate).toHaveBeenCalledWith("measurements");
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
    expect(screen.getByText(/\+3,0 кг/)).toBeInTheDocument();
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

  it("falls back to the item's stored nameUk when the exercise is absent from the catalog (QA D-003)", () => {
    // A manually-added exercise (or a demo-seed id) has no catalog entry, so
    // the PR board must show the workout item's stored `nameUk` rather than
    // leaking the raw exerciseId into the Ukrainian-only UI.
    setHooks({
      exercises: [],
      workouts: [
        {
          id: "w1",
          startedAt: "2026-05-14T18:00:00Z",
          endedAt: "2026-05-14T19:00:00Z",
          items: [
            {
              id: "i1",
              exerciseId: "squat",
              nameUk: "Присідання зі штангою",
              type: "strength",
              musclesPrimary: ["quadriceps"],
              musclesSecondary: [],
              sets: [{ weightKg: 120, reps: 5 }],
            },
          ],
        },
      ],
    });
    render(<Progress onNavigate={onNavigate} />);
    expect(screen.getByText("Присідання зі штангою")).toBeInTheDocument();
    expect(screen.queryByText("squat")).not.toBeInTheDocument();
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

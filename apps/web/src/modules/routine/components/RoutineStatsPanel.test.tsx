/** @vitest-environment jsdom */
/**
 * Unit tests for RoutineStatsPanel.
 *
 * The component composes several heavy children (HabitHeatmap,
 * HabitRangeGrid, HabitLeadersBlock) and delegates stats computation to
 * routine streak helpers. We stub these children and the Kyiv-time helper so
 * the suite is fast and deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { defaultRoutineState } from "@sergeant/routine-domain";
import type { RoutineState } from "../lib/types";

// Fixed "today" = 2026-07-10 UTC noon → Kyiv date 2026-07-10.
const FIXED_NOW = new Date("2026-07-10T09:00:00Z");

vi.mock("@shared/lib/time/kyivTime", () => ({
  getKyivDayKey: () => "2026-07-10",
  getKyivDateParts: () => ({
    year: 2026,
    month: 7,
    day: 10,
    hour: 12,
    minute: 0,
  }),
}));

// Stub heavy children to lightweight markers. The range-grid stub echoes its
// window so the tests can assert which slice the panel asked for.
vi.mock("./HabitHeatmap", () => ({
  HabitHeatmap: ({ historyWeeks }: { historyWeeks?: number }) => (
    <div data-testid="habit-heatmap" data-history-weeks={historyWeeks} />
  ),
}));
vi.mock("./HabitRangeGrid", () => ({
  HabitRangeGrid: ({ days }: { days: number }) => (
    <div data-testid="habit-range-grid" data-days={days} />
  ),
}));
vi.mock("./HabitLeadersBlock", () => ({
  HabitLeadersBlock: () => <div data-testid="habit-leaders-block" />,
}));

// Stub streak helpers so we don't need real habit data.
const completionRateForRange = vi.fn(() => ({
  completed: 3,
  scheduled: 7,
  rate: 0.43,
}));
vi.mock("../lib/streaks", () => ({
  completionRateForRange: (...args: unknown[]) =>
    completionRateForRange(...(args as [])),
  flexibleMaxStreakAllTimeAcrossHabits: () => 5,
}));

import { RoutineStatsPanel } from "./RoutineStatsPanel";

function makeRoutine(overrides: Partial<RoutineState> = {}): RoutineState {
  return { ...defaultRoutineState(), ...overrides };
}

/** Inclusive `[start, end]` window the last rate call was made with. */
function lastRateWindow(): [string, string] {
  const call = completionRateForRange.mock.lastCall as unknown as string[];
  return [call[2]!, call[3]!];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  completionRateForRange.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("RoutineStatsPanel", () => {
  it("renders with role=tabpanel and correct aria attributes", () => {
    render(<RoutineStatsPanel routine={makeRoutine()} currentStreak={0} />);
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "routine-panel-stats");
    expect(panel).toHaveAttribute("aria-labelledby", "routine-tab-stats");
  });

  it("shows the current streak value", () => {
    render(<RoutineStatsPanel routine={makeRoutine()} currentStreak={7} />);
    // The Stat renders "7" as a string in a cell labelled "Серія сьогодні"
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Серія сьогодні")).toBeInTheDocument();
  });

  it("renders the max-streak stat label", () => {
    render(<RoutineStatsPanel routine={makeRoutine()} currentStreak={0} />);
    expect(screen.getByText("Макс. серія")).toBeInTheDocument();
  });

  it("renders every range chip and defaults to Місяць", () => {
    render(<RoutineStatsPanel routine={makeRoutine()} currentStreak={0} />);
    const chips = screen.getByRole("tablist", { name: "Діапазон статистики" });
    for (const label of ["Тиждень", "Місяць", "Квартал", "Рік"]) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
    expect(
      chips.querySelector('[aria-selected="true"]')?.textContent,
    ).toContain("Місяць");
    // Default month slice = rolling 30 days ending today.
    expect(lastRateWindow()).toEqual(["2026-06-11", "2026-07-10"]);
    expect(screen.getByText("Зведення · останні 30 днів")).toBeInTheDocument();
  });

  it("re-scopes the summary window when the range changes", () => {
    render(<RoutineStatsPanel routine={makeRoutine()} currentStreak={0} />);

    fireEvent.click(screen.getByRole("tab", { name: "Тиждень" }));
    // Тижневий зріз має збігтися зі старим числом під підписом «7 днів».
    expect(lastRateWindow()).toEqual(["2026-07-04", "2026-07-10"]);

    fireEvent.click(screen.getByRole("tab", { name: "Квартал" }));
    expect(lastRateWindow()).toEqual(["2026-04-12", "2026-07-10"]);

    fireEvent.click(screen.getByRole("tab", { name: "Рік" }));
    expect(lastRateWindow()).toEqual(["2025-07-11", "2026-07-10"]);
  });

  it("shows per-habit rows on short ranges and the heatmap on long ones", () => {
    render(<RoutineStatsPanel routine={makeRoutine()} currentStreak={0} />);

    // Default (Місяць) → rows.
    expect(screen.getByTestId("habit-range-grid")).toHaveAttribute(
      "data-days",
      "30",
    );
    expect(screen.queryByTestId("habit-heatmap")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Тиждень" }));
    expect(screen.getByTestId("habit-range-grid")).toHaveAttribute(
      "data-days",
      "7",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Квартал" }));
    expect(screen.queryByTestId("habit-range-grid")).not.toBeInTheDocument();
    expect(screen.getByTestId("habit-heatmap")).toHaveAttribute(
      "data-history-weeks",
      "13",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Рік" }));
    expect(screen.getByTestId("habit-heatmap")).toHaveAttribute(
      "data-history-weeks",
      "53",
    );
  });

  it("mounts child widgets", () => {
    render(<RoutineStatsPanel routine={makeRoutine()} currentStreak={0} />);
    expect(screen.getByTestId("habit-range-grid")).toBeInTheDocument();
    expect(screen.getByTestId("habit-leaders-block")).toBeInTheDocument();
  });

  it("hides panel content when hidden=true", () => {
    render(
      <RoutineStatsPanel routine={makeRoutine()} currentStreak={0} hidden />,
    );
    const panel = screen.getByRole("tabpanel", { hidden: true });
    expect(panel).toHaveAttribute("hidden");
  });

  it("computes max streak across active habits", () => {
    // maxStreakAllTime is stubbed to return 5 per habit.
    // Two active habits → still 5 (max of [5,5]).
    const routine = makeRoutine({
      habits: [
        { id: "h1", name: "Вода" } as never,
        { id: "h2", name: "Спорт" } as never,
      ],
    });
    render(<RoutineStatsPanel routine={routine} currentStreak={3} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});

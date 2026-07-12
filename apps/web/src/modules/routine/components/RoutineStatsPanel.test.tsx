/** @vitest-environment jsdom */
/**
 * Unit tests for RoutineStatsPanel.
 *
 * The component composes several heavy children (HabitHeatmap,
 * HabitLeadersBlock) and delegates stats computation to routineStatss helpers.
 * We stub these children and the Kyiv-time helper so the suite is fast and
 * deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { defaultRoutineState } from "@sergeant/routine-domain";
import type { RoutineState } from "../lib/types";

// Fixed "today" = 2026-07-10 UTC noon → Kyiv date 2026-07-10.
const FIXED_NOW = new Date("2026-07-10T09:00:00Z");

vi.mock("@shared/lib/time/kyivTime", () => ({
  getKyivDayKey: () => "2026-07-10",
}));

// Stub heavy children to lightweight markers.
vi.mock("./HabitHeatmap", () => ({
  HabitHeatmap: () => <div data-testid="habit-heatmap" />,
}));
vi.mock("./HabitLeadersBlock", () => ({
  HabitLeadersBlock: () => <div data-testid="habit-leaders-block" />,
}));

// Stub streak helpers so we don't need real habit data.
vi.mock("../lib/streaks", () => ({
  completionRateForRange: () => ({ completed: 3, scheduled: 7, rate: 0.43 }),
  maxStreakAllTime: () => 5,
}));

vi.mock("../lib/hubCalendarAggregate", () => ({
  dateKeyFromDate: (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`,
  parseDateKey: (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y!, m! - 1, d!);
  },
}));

import { RoutineStatsPanel } from "./RoutineStatsPanel";

function makeRoutine(overrides: Partial<RoutineState> = {}): RoutineState {
  return { ...defaultRoutineState(), ...overrides };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
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

  it("renders 7, 30, 90-day stat labels", () => {
    render(<RoutineStatsPanel routine={makeRoutine()} currentStreak={0} />);
    expect(screen.getByText("7 днів")).toBeInTheDocument();
    expect(screen.getByText("30 днів")).toBeInTheDocument();
    expect(screen.getByText("90 днів")).toBeInTheDocument();
  });

  it("renders the max-streak stat label", () => {
    render(<RoutineStatsPanel routine={makeRoutine()} currentStreak={0} />);
    expect(screen.getByText("Макс. серія")).toBeInTheDocument();
  });

  it("renders the Зведення section heading", () => {
    render(<RoutineStatsPanel routine={makeRoutine()} currentStreak={0} />);
    expect(screen.getByText("Зведення")).toBeInTheDocument();
  });

  it("mounts child widgets", () => {
    render(<RoutineStatsPanel routine={makeRoutine()} currentStreak={0} />);
    expect(screen.getByTestId("habit-heatmap")).toBeInTheDocument();
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

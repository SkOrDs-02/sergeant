// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const getCachedFizrukSqliteState = vi.fn();
vi.mock("@fizruk/lib/sqliteReader", () => ({
  getCachedFizrukSqliteState: () => getCachedFizrukSqliteState(),
}));

import FitnessCard from "./FitnessCard";

// A completed workout today (ISO timestamps) → count 1 for the current week.
function cacheWithWorkout(): Record<string, unknown> {
  const now = new Date();
  const start = new Date(now);
  start.setHours(8, 0, 0, 0);
  const end = new Date(now);
  end.setHours(9, 0, 0, 0);
  return {
    workouts: [{ startedAt: start.toISOString(), endedAt: end.toISOString() }],
    refreshedAt: now.toISOString(),
  };
}

const emptyWarmCache = {
  workouts: [],
  refreshedAt: new Date().toISOString(),
};

describe("FitnessCard", () => {
  beforeEach(() => {
    localStorage.clear();
    getCachedFizrukSqliteState.mockReturnValue(emptyWarmCache);
  });
  afterEach(() => vi.clearAllMocks());

  it("renders collapsed by default with a workout-count summary and toggles open", () => {
    getCachedFizrukSqliteState.mockReturnValue(cacheWithWorkout());
    render(<FitnessCard period="week" offset={0} />);

    const toggle = screen.getByRole("button", { name: /Фізрук/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByText(/трен\./i).length).toBeGreaterThan(0);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Минулий/i)).toBeInTheDocument();
  });

  it("renders the no-data placeholder when the warm cache is empty", () => {
    getCachedFizrukSqliteState.mockReturnValue(emptyWarmCache);
    render(<FitnessCard period="week" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Фізрук/i }));
    expect(screen.getByText(/Немає даних/i)).toBeInTheDocument();
  });

  it("treats a cold cache (refreshedAt null) as no data", () => {
    getCachedFizrukSqliteState.mockReturnValue({
      workouts: [],
      refreshedAt: null,
    });
    render(<FitnessCard period="month" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Фізрук/i }));
    expect(screen.getByText(/Немає даних/i)).toBeInTheDocument();
  });

  it("renders the bar chart with workout data", () => {
    getCachedFizrukSqliteState.mockReturnValue(cacheWithWorkout());
    render(<FitnessCard period="week" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Фізрук/i }));
    const chart = screen.getByLabelText("Графік");
    expect(chart.querySelectorAll("button").length).toBeGreaterThan(0);
  });
});

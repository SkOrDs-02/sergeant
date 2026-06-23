// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const loadRoutineState = vi.fn();
vi.mock("@routine/lib/routineStorage", () => ({
  loadRoutineState: () => loadRoutineState(),
}));

import RoutineCard from "./RoutineCard";
import { localDateKey } from "./hubReports.aggregation";

// A single habit completed today → non-zero pct for the current week.
function stateWithCompletion(): Record<string, unknown> {
  return {
    habits: [{ id: "h1", archived: false }],
    completions: { h1: [localDateKey()] },
  };
}

describe("RoutineCard", () => {
  beforeEach(() => {
    localStorage.clear();
    loadRoutineState.mockReturnValue({ habits: [], completions: {} });
  });
  afterEach(() => vi.clearAllMocks());

  it("renders collapsed by default with a percent summary and toggles open", () => {
    loadRoutineState.mockReturnValue(stateWithCompletion());
    render(<RoutineCard period="week" offset={0} />);

    const toggle = screen.getByRole("button", { name: /Рутина/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByText(/%/).length).toBeGreaterThan(0);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Минулий/i)).toBeInTheDocument();
  });

  it("renders the no-data placeholder with no completions", () => {
    loadRoutineState.mockReturnValue({ habits: [], completions: {} });
    render(<RoutineCard period="week" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Рутина/i }));
    expect(screen.getByText(/Немає даних/i)).toBeInTheDocument();
  });

  it("renders the bar chart with completion data", () => {
    loadRoutineState.mockReturnValue(stateWithCompletion());
    render(<RoutineCard period="week" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Рутина/i }));
    const chart = screen.getByLabelText("Графік");
    expect(chart.querySelectorAll("button").length).toBeGreaterThan(0);
  });

  it("ignores archived habits without crashing", () => {
    loadRoutineState.mockReturnValue({
      habits: [{ id: "h1", archived: true }],
      completions: { h1: [localDateKey()] },
    });
    render(<RoutineCard period="month" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Рутина/i }));
    expect(screen.getByText(/Немає даних/i)).toBeInTheDocument();
  });
});

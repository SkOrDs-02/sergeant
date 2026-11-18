// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const loadRoutineState = vi.fn();
vi.mock("@routine/lib/routineStorage", () => ({
  loadRoutineState: () => loadRoutineState(),
}));

import RoutineCard from "./RoutineCard";
import { localDateKey, reportWindows } from "./hubReports.aggregation";
import { messages } from "@shared/i18n/uk";

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

    const toggle = screen.getByRole("button", { name: /Звички/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByText(/%/).length).toBeGreaterThan(0);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Минулий/i)).toBeInTheDocument();
  });

  // Рішення власника 2026-11-18 (METRICS_VERSION 20): «не зміг» виходить зі
  // знаменника, тож картка Звітів не рахує заявлений пропуск провалом.
  it("«не зміг» поза знаменником: 2 виконано + 5 пропусків за минулий тиждень = 100%", () => {
    const days = reportWindows("week", -1).cur;
    expect(days).toHaveLength(7);
    loadRoutineState.mockReturnValue({
      habits: [
        {
          id: "h1",
          name: "Вода",
          recurrence: "daily",
          startDate: "2020-01-01",
        },
      ],
      completions: { h1: days.slice(0, 2) },
      skips: Object.fromEntries([
        [
          "h1",
          Object.fromEntries(
            days
              .slice(2)
              .map((d) => [d, { reason: "sick", at: `${d}T10:00:00.000Z` }]),
          ),
        ],
      ]),
    });
    render(<RoutineCard period="week" offset={-1} />);
    expect(screen.getAllByText(/100\s?%/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/29\s?%/)).toBeNull();
  });

  it("renders the no-data placeholder with no completions", () => {
    loadRoutineState.mockReturnValue({ habits: [], completions: {} });
    render(<RoutineCard period="week" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Звички/i }));
    expect(
      screen.getByText(messages.hub.reportEmptyHabits),
    ).toBeInTheDocument();
  });

  it("renders the consistency heatmap with completion data", () => {
    loadRoutineState.mockReturnValue(stateWithCompletion());
    render(<RoutineCard period="week" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Звички/i }));
    // Heatmap замінив стовпчиковий графік: контейнер лишається під тим
    // самим aria-label, а дні тепер — клітинки-`div` з per-cell aria-label
    // «DD.MM: N%» (тиждень → 7 клітинок).
    const chart = screen.getByLabelText("Графік");
    const cells = chart.querySelectorAll("[aria-label*='%']");
    expect(cells.length).toBe(7);
  });

  it("ignores archived habits without crashing", () => {
    loadRoutineState.mockReturnValue({
      habits: [{ id: "h1", archived: true }],
      completions: { h1: [localDateKey()] },
    });
    render(<RoutineCard period="month" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Звички/i }));
    expect(
      screen.getByText(messages.hub.reportEmptyHabits),
    ).toBeInTheDocument();
  });
});

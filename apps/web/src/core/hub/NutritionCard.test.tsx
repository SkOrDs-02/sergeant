// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const loadNutritionLog = vi.fn();
vi.mock("@nutrition/lib/nutritionStorage", () => ({
  loadNutritionLog: () => loadNutritionLog(),
}));

import NutritionCard from "./NutritionCard";
import { localDateKey } from "./hubReports.aggregation";

// Build a nutrition log keyed by day with meal kcal so the card has data
// for the current week. `localDateKey` matches the aggregation day-keys.
function logForToday(kcal: number): Record<string, unknown> {
  return {
    [localDateKey()]: {
      meals: [{ macros: { kcal } }],
    },
  };
}

describe("NutritionCard", () => {
  beforeEach(() => {
    localStorage.clear();
    loadNutritionLog.mockReturnValue({});
  });
  afterEach(() => vi.clearAllMocks());

  it("renders collapsed by default with heading and toggles open", () => {
    loadNutritionLog.mockReturnValue(logForToday(2000));
    render(<NutritionCard period="week" offset={0} />);

    const toggle = screen.getByRole("button", { name: /Харчування/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // kcal unit label is shown in the collapsed summary
    expect(screen.getAllByText(/ккал/i).length).toBeGreaterThan(0);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // Previous-period line only renders when expanded
    expect(screen.getByText(/Минулий/i)).toBeInTheDocument();
  });

  it("renders the no-data placeholder when expanded with an empty log", () => {
    loadNutritionLog.mockReturnValue({});
    render(<NutritionCard period="week" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Харчування/i }));
    expect(screen.getByText(/Немає даних/i)).toBeInTheDocument();
  });

  it("renders the bar chart and supports selecting/deselecting a bar", () => {
    loadNutritionLog.mockReturnValue(logForToday(1500));
    render(<NutritionCard period="week" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Харчування/i }));

    const chart = screen.getByLabelText("Графік");
    const bars = chart.querySelectorAll("button");
    expect(bars.length).toBeGreaterThan(0);
    // Click the bar for today (it has a non-zero value) to select it
    const todayBar = Array.from(bars).find((b) =>
      b.getAttribute("aria-label")?.includes("1"),
    );
    expect(todayBar).toBeTruthy();
    fireEvent.click(todayBar!);
    expect(todayBar).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(todayBar!);
    expect(todayBar).toHaveAttribute("aria-pressed", "false");
  });

  it("renders month period without crashing", () => {
    loadNutritionLog.mockReturnValue(logForToday(1800));
    render(<NutritionCard period="month" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Харчування/i }));
    expect(screen.getByText(/Минулий/i)).toBeInTheDocument();
  });
});

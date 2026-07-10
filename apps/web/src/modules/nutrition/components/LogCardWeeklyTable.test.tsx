// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Unit tests for the collapsible weekly log table.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getMacrosForDateRange = vi.fn();

vi.mock("../lib/nutritionStorage", () => ({
  getMacrosForDateRange: (...args: unknown[]) => getMacrosForDateRange(...args),
}));

import { LogCardWeeklyTable } from "./LogCardWeeklyTable";

const ROWS = [
  {
    date: "2026-06-20",
    kcal: 1800,
    protein_g: 120,
    fat_g: 60,
    carbs_g: 200,
  },
  {
    date: "2026-06-21",
    kcal: 1950,
    protein_g: 130,
    fat_g: 65,
    carbs_g: 210,
  },
];

describe("LogCardWeeklyTable", () => {
  it("hides the table until the section is expanded", () => {
    getMacrosForDateRange.mockReturnValue(ROWS);
    render(<LogCardWeeklyTable log={{}} selectedDate="2026-06-21" />);
    expect(screen.queryByText("06-20")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Журнал за тиждень/ }));
    expect(screen.getByText("06-20")).toBeInTheDocument();
    expect(screen.getByText("1800")).toBeInTheDocument();
    expect(getMacrosForDateRange).toHaveBeenCalledWith({}, "2026-06-21", 7);
  });
});

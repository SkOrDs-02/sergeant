// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NutritionLog } from "@sergeant/nutrition-domain";
import { LogCardWeeklyTable } from "./LogCardWeeklyTable";

const LOG = {
  "2026-07-09": {
    meals: [
      {
        id: "m1",
        time: "08:00",
        name: "Сніданок",
        macros: { kcal: 400, protein_g: 20, fat_g: 10, carbs_g: 45 },
      },
    ],
  },
} as unknown as NutritionLog;

describe("LogCardWeeklyTable", () => {
  it("hides weekly table until toggled open", () => {
    render(<LogCardWeeklyTable log={LOG} selectedDate="2026-07-09" />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Журнал за тиждень/ }));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

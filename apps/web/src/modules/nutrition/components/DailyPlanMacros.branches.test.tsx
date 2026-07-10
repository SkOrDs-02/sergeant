// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import { MacroBadge, MacroRatioBar } from "./DailyPlanMacros";

const EMPTY_PREFS = {} as NutritionPrefs;

describe("MacroRatioBar", () => {
  it("returns null when all macro targets are zero or unset", () => {
    const { container } = render(<MacroRatioBar prefs={EMPTY_PREFS} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders percentage segments when macros are set", () => {
    render(
      <MacroRatioBar
        prefs={
          {
            dailyTargetProtein_g: 100,
            dailyTargetFat_g: 50,
            dailyTargetCarbs_g: 200,
          } as NutritionPrefs
        }
      />,
    );
    expect(
      screen.getByText("Відсоткове співвідношення макро"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Б \d+%/)).toBeInTheDocument();
  });

  it("renders only protein segment when fat and carbs are zero", () => {
    render(
      <MacroRatioBar
        prefs={
          {
            dailyTargetProtein_g: 120,
            dailyTargetFat_g: 0,
            dailyTargetCarbs_g: 0,
          } as NutritionPrefs
        }
      />,
    );
    expect(screen.getByText(/Б 100%/)).toBeInTheDocument();
  });
});

describe("MacroBadge", () => {
  it("returns null when value is null or undefined", () => {
    const { container: nullContainer } = render(
      <MacroBadge label="Б" value={null} />,
    );
    expect(nullContainer.firstChild).toBeNull();
  });

  it("renders rounded value with custom unit and label", () => {
    render(<MacroBadge label="ккал" value={420.6} unit="" />);
    expect(screen.getByText("421")).toBeInTheDocument();
  });
});

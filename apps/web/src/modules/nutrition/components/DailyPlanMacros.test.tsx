// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Unit tests for daily-plan macro ratio bar and badge atoms.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MacroBadge, MacroRatioBar } from "./DailyPlanMacros";

describe("MacroRatioBar", () => {
  it("renders nothing when all macro targets are zero or missing", () => {
    const { container } = render(
      <MacroRatioBar prefs={{ dailyTargetProtein_g: 0 } as never} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders percentage segments and gram summaries when targets are set", () => {
    render(
      <MacroRatioBar
        prefs={
          {
            dailyTargetProtein_g: 100,
            dailyTargetFat_g: 50,
            dailyTargetCarbs_g: 200,
          } as never
        }
      />,
    );
    expect(
      screen.getByText("Відсоткове співвідношення макро"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Б \d+% · 100г/)).toBeInTheDocument();
    expect(screen.getByText(/Ж \d+% · 50г/)).toBeInTheDocument();
    expect(screen.getByText(/В \d+% · 200г/)).toBeInTheDocument();
  });
});

describe("MacroBadge", () => {
  it("renders nothing when value is null", () => {
    const { container } = render(<MacroBadge label="Б" value={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a rounded macro value with label and unit", () => {
    render(<MacroBadge label="Б" value={42.6} unit="г" />);
    expect(screen.getByText("43")).toBeInTheDocument();
    expect(screen.getByText("г")).toBeInTheDocument();
    expect(screen.getByText("Б")).toBeInTheDocument();
  });
});

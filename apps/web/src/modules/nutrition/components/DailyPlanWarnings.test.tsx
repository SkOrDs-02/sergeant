// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the DailyPlan warning components.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GoalRangeWarning,
  MacroKcalWarning,
  MissingMacrosHint,
} from "./DailyPlanWarnings";

afterEach(() => vi.clearAllMocks());

describe("MissingMacrosHint", () => {
  it("renders nothing without a kcal goal", () => {
    const { container } = render(
      <MissingMacrosHint prefs={{} as never} setPrefs={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when macros are already set", () => {
    const { container } = render(
      <MissingMacrosHint
        prefs={{ dailyTargetKcal: 2000, dailyTargetProtein_g: 150 } as never}
        setPrefs={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("suggests average macros when only kcal is set", () => {
    const setPrefs = vi.fn();
    render(
      <MissingMacrosHint
        prefs={{ dailyTargetKcal: 2000 } as never}
        setPrefs={setPrefs}
      />,
    );
    expect(screen.getByTestId("missing-macros-hint")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Підставити середні/));
    const updater = setPrefs.mock.calls[0]![0];
    const next = updater({});
    expect(next.dailyTargetProtein_g).toBeGreaterThan(0);
    expect(next.dailyTargetFat_g).toBeGreaterThan(0);
    expect(next.dailyTargetCarbs_g).toBeGreaterThan(0);
  });
});

describe("MacroKcalWarning", () => {
  it("renders nothing when macros line up with kcal", () => {
    const { container } = render(
      <MacroKcalWarning
        prefs={
          {
            dailyTargetKcal: 2000,
            dailyTargetProtein_g: 150,
            dailyTargetFat_g: 65,
            dailyTargetCarbs_g: 196,
          } as never
        }
        setPrefs={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("warns and offers a recompute when macros overshoot kcal", () => {
    const setPrefs = vi.fn();
    render(
      <MacroKcalWarning
        prefs={
          {
            dailyTargetKcal: 1000,
            dailyTargetProtein_g: 200,
            dailyTargetFat_g: 100,
            dailyTargetCarbs_g: 200,
          } as never
        }
        setPrefs={setPrefs}
      />,
    );
    expect(screen.getByTestId("macro-kcal-warning")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Перерахувати ккал/));
    expect(setPrefs).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Скинути макро"));
    const updater = setPrefs.mock.calls.at(-1)?.[0];
    expect(updater({})).toMatchObject({
      dailyTargetProtein_g: null,
      dailyTargetFat_g: null,
      dailyTargetCarbs_g: null,
    });
  });
});

describe("GoalRangeWarning", () => {
  it("renders nothing for in-range goals", () => {
    const { container } = render(
      <GoalRangeWarning
        prefs={
          {
            dailyTargetKcal: 2000,
            dailyTargetProtein_g: 150,
            dailyTargetFat_g: 65,
            dailyTargetCarbs_g: 196,
          } as never
        }
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("lists issues for an out-of-range goal", () => {
    render(
      <GoalRangeWarning
        prefs={{ dailyTargetKcal: 50, dailyTargetProtein_g: 5000 } as never}
      />,
    );
    expect(screen.getByTestId("goal-range-warning")).toBeInTheDocument();
  });
});

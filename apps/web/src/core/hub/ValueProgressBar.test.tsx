// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { EMPTY_GOALS } from "@sergeant/shared";

import { ValueProgressBar, hasAnyValueBar } from "./ValueProgressBar";

afterEach(cleanup);

describe("ValueProgressBar (S3.3a)", () => {
  it("renders nothing when no module has a goal set", () => {
    const { container } = render(
      <ValueProgressBar
        activeModules={["finyk", "routine"]}
        goals={EMPTY_GOALS}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when goals exist but their modules are not active", () => {
    const { container } = render(
      <ValueProgressBar
        activeModules={["fizruk", "nutrition"]}
        goals={{
          ...EMPTY_GOALS,
          finykBudget: 30000,
          routineFirstHabit: "water",
        }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a routine bar when routineFirstHabit is set", () => {
    render(
      <ValueProgressBar
        activeModules={["routine"]}
        goals={{ ...EMPTY_GOALS, routineFirstHabit: "water" }}
      />,
    );

    const bar = screen.getByTestId("value-progress-bar-routine");
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar).toHaveAttribute("aria-label", "Звичка «Пити воду» — 0/30 днів");
  });

  it("renders a finyk bar with the budget formatted in thousands", () => {
    render(
      <ValueProgressBar
        activeModules={["finyk"]}
        goals={{ ...EMPTY_GOALS, finykBudget: 30000 }}
      />,
    );

    const bar = screen.getByTestId("value-progress-bar-finyk");
    expect(bar).toBeInTheDocument();
    // 30000 → "30 000 ₴" (NBSP between thousands; `replace(/,/g, " ")` upgrades
    // toLocaleString's separator to the visible space the slider label uses).
    expect(bar.getAttribute("aria-label")).toMatch(/Бюджет 30[ \u00a0]000 ₴/);
    expect(bar.getAttribute("aria-label")).toContain("Записано 0 ₴");
  });

  it("falls back to a generic label for unknown habit preset ids", () => {
    render(
      <ValueProgressBar
        activeModules={["routine"]}
        goals={{ ...EMPTY_GOALS, routineFirstHabit: "custom" }}
      />,
    );
    expect(screen.getByTestId("value-progress-bar-routine")).toHaveAttribute(
      "aria-label",
      "Звичка «Своя звичка» — 0/30 днів",
    );
  });

  it("renders routine before finyk to match FIRST_ACTION_PRIORITY", () => {
    render(
      <ValueProgressBar
        activeModules={["finyk", "routine"]}
        goals={{
          ...EMPTY_GOALS,
          finykBudget: 15000,
          routineFirstHabit: "exercise",
        }}
      />,
    );
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAttribute(
      "data-testid",
      "value-progress-bar-routine",
    );
    expect(bars[1]).toHaveAttribute("data-testid", "value-progress-bar-finyk");
  });

  it("renders a nutrition bar with the goal-specific label (S3.3b)", () => {
    render(
      <ValueProgressBar
        activeModules={["nutrition"]}
        goals={{ ...EMPTY_GOALS, nutritionGoal: "maintain" }}
      />,
    );
    const bar = screen.getByTestId("value-progress-bar-nutrition");
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute(
      "aria-label",
      "Підтримка ваги — 0 страв сьогодні",
    );
  });

  it("renders a fizruk bar with the per-week target (S3.3b)", () => {
    render(
      <ValueProgressBar
        activeModules={["fizruk"]}
        goals={{ ...EMPTY_GOALS, fizrukWeeklyGoal: 3 }}
      />,
    );
    const bar = screen.getByTestId("value-progress-bar-fizruk");
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute("aria-label", "3×/тиждень — 0 з 3");
  });

  it("orders bars routine → finyk → nutrition → fizruk (S3.3b)", () => {
    render(
      <ValueProgressBar
        activeModules={["fizruk", "nutrition", "finyk", "routine"]}
        goals={{
          finykBudget: 30000,
          fizrukWeeklyGoal: 4,
          nutritionGoal: "lose",
          routineFirstHabit: "water",
        }}
      />,
    );
    const bars = screen.getAllByRole("progressbar");
    expect(bars.map((b) => b.getAttribute("data-testid"))).toEqual([
      "value-progress-bar-routine",
      "value-progress-bar-finyk",
      "value-progress-bar-nutrition",
      "value-progress-bar-fizruk",
    ]);
  });

  it("hides nutrition / fizruk bars when their module is not active (S3.3b)", () => {
    render(
      <ValueProgressBar
        activeModules={["routine"]}
        goals={{
          ...EMPTY_GOALS,
          fizrukWeeklyGoal: 3,
          nutritionGoal: "lose",
          routineFirstHabit: "water",
        }}
      />,
    );
    expect(screen.queryByTestId("value-progress-bar-fizruk")).toBeNull();
    expect(screen.queryByTestId("value-progress-bar-nutrition")).toBeNull();
    expect(
      screen.getByTestId("value-progress-bar-routine"),
    ).toBeInTheDocument();
  });

  it("uses each variant of nutritionGoal label (S3.3b)", () => {
    for (const goal of ["lose", "gain", "maintain"] as const) {
      cleanup();
      render(
        <ValueProgressBar
          activeModules={["nutrition"]}
          goals={{ ...EMPTY_GOALS, nutritionGoal: goal }}
        />,
      );
      expect(
        screen.getByTestId("value-progress-bar-nutrition"),
      ).toBeInTheDocument();
    }
  });
});

describe("hasAnyValueBar (S3.3a)", () => {
  it("returns false for empty goals", () => {
    expect(
      hasAnyValueBar({
        activeModules: ["finyk", "routine"],
        goals: EMPTY_GOALS,
      }),
    ).toBe(false);
  });

  it("returns true when at least one active module has a goal", () => {
    expect(
      hasAnyValueBar({
        activeModules: ["finyk"],
        goals: { ...EMPTY_GOALS, finykBudget: 30000 },
      }),
    ).toBe(true);
  });

  it("returns false when goals exist but their module is inactive", () => {
    expect(
      hasAnyValueBar({
        activeModules: ["fizruk"],
        goals: { ...EMPTY_GOALS, finykBudget: 30000 },
      }),
    ).toBe(false);
  });
});

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
    expect(bar).toHaveAttribute(
      "aria-label",
      "«Пити воду» — через 30 днів автоматично — Зараз: 0/30",
    );
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
      "«Своя звичка» — через 30 днів автоматично — Зараз: 0/30",
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

describe("ValueProgressBar — outcome-first copy (S6.6 audit-guard)", () => {
  // The previous routine bar read «Звичка «Пити воду» · 0/30 днів» — a
  // *mechanism* readout. Audit B-4 asked us to lead with the outcome
  // (an automatic habit after N днів) so 0/30 stops feeling like a
  // 0-streak shame indicator. These tests lock that frame so the
  // mechanism-first phrasing cannot quietly come back through a
  // copy-tweak PR.
  const banned = [
    /\bСерія днів\b/i,
    /\bстрик\b/i,
    /\bstreak\b/i,
    // The exact pre-S6.6 routine label / current — should never reappear
    // verbatim, even if a refactor accidentally restores them.
    /Звичка «[^»]+» — \d+\/\d+ днів/,
  ];

  it("routine bar leads with outcome («автоматично») — not «Серія днів»", () => {
    render(
      <ValueProgressBar
        activeModules={["routine"]}
        goals={{ ...EMPTY_GOALS, routineFirstHabit: "water" }}
      />,
    );
    const bar = screen.getByTestId("value-progress-bar-routine");
    const ariaLabel = bar.getAttribute("aria-label") ?? "";
    // Outcome words present.
    expect(ariaLabel).toMatch(/автоматично/);
    expect(ariaLabel).toMatch(/30/);
    // Banned mechanism phrasings absent.
    for (const pattern of banned) {
      expect(ariaLabel).not.toMatch(pattern);
      expect(document.body.textContent ?? "").not.toMatch(pattern);
    }
  });

  it("works for every habit preset — outcome frame never decays", () => {
    for (const habit of ["water", "exercise", "reading", "custom"] as const) {
      cleanup();
      render(
        <ValueProgressBar
          activeModules={["routine"]}
          goals={{ ...EMPTY_GOALS, routineFirstHabit: habit }}
        />,
      );
      const ariaLabel =
        screen
          .getByTestId("value-progress-bar-routine")
          .getAttribute("aria-label") ?? "";
      expect(ariaLabel, `habit=${habit}`).toMatch(/автоматично/);
      for (const pattern of banned) {
        expect(ariaLabel, `habit=${habit}`).not.toMatch(pattern);
      }
    }
  });
});

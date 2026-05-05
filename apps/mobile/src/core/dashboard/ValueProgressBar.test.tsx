import { render } from "@testing-library/react-native";

import { EMPTY_GOALS } from "@sergeant/shared";

import { ValueProgressBar } from "./ValueProgressBar";

describe("ValueProgressBar (mobile, S3.3 parity)", () => {
  it("renders nothing when no module has a goal", () => {
    const { queryByTestId } = render(
      <ValueProgressBar
        activeModules={["finyk", "routine"]}
        goals={EMPTY_GOALS}
      />,
    );
    expect(queryByTestId("value-progress-bars")).toBeNull();
  });

  it("renders nothing when goals exist but their modules are not active", () => {
    const { queryByTestId } = render(
      <ValueProgressBar
        activeModules={["fizruk"]}
        goals={{ ...EMPTY_GOALS, finykBudget: 30000 }}
      />,
    );
    expect(queryByTestId("value-progress-bars")).toBeNull();
  });

  it("renders a finyk bar with the wizard-formatted budget", () => {
    const { getByTestId } = render(
      <ValueProgressBar
        activeModules={["finyk"]}
        goals={{ ...EMPTY_GOALS, finykBudget: 30000 }}
      />,
    );

    const bar = getByTestId("value-progress-bar-finyk");
    // 30000 → "30 000 ₴" (NBSP between thousands; matches the wizard
    // slider label).
    expect(bar.props.accessibilityLabel).toMatch(
      /Бюджет 30[ \u00a0]000 ₴ — Записано 0 ₴/,
    );
    expect(bar.props.accessibilityValue).toEqual({
      now: 0,
      min: 0,
      max: 100,
    });
  });

  it("renders a routine bar with the outcome-first label (S6.6 audit-guard)", () => {
    const { getByTestId } = render(
      <ValueProgressBar
        activeModules={["routine"]}
        goals={{ ...EMPTY_GOALS, routineFirstHabit: "water" }}
      />,
    );

    const bar = getByTestId("value-progress-bar-routine");
    expect(bar.props.accessibilityLabel).toBe(
      "«Пити воду» — через 30 днів автоматично — Зараз: 0/30",
    );
  });

  it("renders nutrition + fizruk bars when their goals are set (S3.3b)", () => {
    const { getByTestId } = render(
      <ValueProgressBar
        activeModules={["nutrition", "fizruk"]}
        goals={{
          ...EMPTY_GOALS,
          nutritionGoal: "maintain",
          fizrukWeeklyGoal: 3,
        }}
      />,
    );
    expect(
      getByTestId("value-progress-bar-nutrition").props.accessibilityLabel,
    ).toBe("Підтримка ваги — 0 страв сьогодні");
    expect(
      getByTestId("value-progress-bar-fizruk").props.accessibilityLabel,
    ).toBe("3×/тиждень — 0 з 3");
  });
});

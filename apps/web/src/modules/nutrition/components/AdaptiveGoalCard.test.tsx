// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AdaptiveGoalCard } from "./AdaptiveGoalCard";
import type { AdaptiveGoalState } from "../hooks/useAdaptiveNutritionGoal";

function state(overrides: Partial<AdaptiveGoalState>): AdaptiveGoalState {
  return {
    mode: "active",
    completeDays: 0,
    weightPoints: 0,
    lastUpdatedAt: null,
    ...overrides,
  };
}

// 2026-09-11: вмикач автокалібрування переїхав у Налаштування → Їжа, тож
// дашборд показує рядок лише коли є що робити — `active`/`disabled` мовчать.
describe("AdaptiveGoalCard", () => {
  it("renders nothing for 'active'", () => {
    const { container } = render(
      <AdaptiveGoalCard state={state({ mode: "active" })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for 'disabled'", () => {
    const { container } = render(
      <AdaptiveGoalCard state={state({ mode: "disabled" })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a compact row with progress for 'calibrating', no action button", () => {
    render(
      <AdaptiveGoalCard
        state={state({ mode: "calibrating", completeDays: 3, weightPoints: 2 })}
        onOpenSettings={vi.fn()}
      />,
    );
    expect(screen.getByText(/3\/10 повних днів/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders an action for 'profile-needed' that calls onOpenSettings", () => {
    const onOpenSettings = vi.fn();
    render(
      <AdaptiveGoalCard
        state={state({ mode: "profile-needed" })}
        onOpenSettings={onOpenSettings}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

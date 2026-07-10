// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Unit tests for a single daily-plan meal row.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DailyPlanMealRow } from "./DailyPlanMealRow";

const MEAL = {
  type: "lunch",
  name: "Курка з рисом",
  description: "Легкий обід",
  kcal: 520,
  protein_g: 42,
  fat_g: 12,
  carbs_g: 55,
  ingredients: ["курка", "рис", "овочі"],
};

describe("DailyPlanMealRow", () => {
  it("renders meal metadata and macro badges", () => {
    render(
      <DailyPlanMealRow meal={MEAL} onAddToLog={vi.fn()} onRegen={vi.fn()} />,
    );
    expect(screen.getByText("Обід")).toBeInTheDocument();
    expect(screen.getByText("Курка з рисом")).toBeInTheDocument();
    expect(screen.getByText("Легкий обід")).toBeInTheDocument();
    expect(screen.getByText("520")).toBeInTheDocument();
  });

  it("calls onAddToLog and onRegen from action buttons", () => {
    const onAddToLog = vi.fn();
    const onRegen = vi.fn();
    render(
      <DailyPlanMealRow
        meal={MEAL}
        onAddToLog={onAddToLog}
        onRegen={onRegen}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "+ Журнал" }));
    expect(onAddToLog).toHaveBeenCalledWith(MEAL);

    fireEvent.click(screen.getByRole("button", { name: "↻ Замінити" }));
    expect(onRegen).toHaveBeenCalledWith("lunch");
  });

  it("expands and collapses the ingredients list", () => {
    render(
      <DailyPlanMealRow meal={MEAL} onAddToLog={vi.fn()} onRegen={vi.fn()} />,
    );

    fireEvent.click(screen.getByText("▼ Інгредієнти"));
    expect(screen.getByText("курка")).toBeInTheDocument();

    fireEvent.click(screen.getByText("▲ Сховати інгредієнти"));
    expect(screen.queryByText("курка")).not.toBeInTheDocument();
  });
});

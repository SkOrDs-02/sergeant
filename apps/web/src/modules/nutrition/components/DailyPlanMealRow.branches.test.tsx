// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
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
  ingredients: ["курка", "рис"],
};

describe("DailyPlanMealRow", () => {
  it("invokes action callbacks", () => {
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

  it("toggles ingredients list", () => {
    render(
      <DailyPlanMealRow meal={MEAL} onAddToLog={vi.fn()} onRegen={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "▼ Інгредієнти" }));
    expect(screen.getByText("курка")).toBeInTheDocument();
  });

  it("disables buttons when busy", () => {
    render(
      <DailyPlanMealRow
        meal={{ name: "Сніданок", type: "breakfast" }}
        onAddToLog={vi.fn()}
        onRegen={vi.fn()}
        busy
      />,
    );
    expect(screen.getByRole("button", { name: "+ Журнал" })).toBeDisabled();
  });
});

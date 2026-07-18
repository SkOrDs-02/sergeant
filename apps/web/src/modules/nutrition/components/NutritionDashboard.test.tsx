// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the `NutritionDashboard` hero/insights/week render.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../hooks/useProteinLowInsight", () => ({
  useProteinLowInsight: () => null,
}));
vi.mock("../hooks/useStreakSevenDaysInsight", () => ({
  useStreakSevenDaysInsight: () => null,
}));
vi.mock("../hooks/useNutritionQuickChips", () => ({
  useNutritionQuickChips: () => [],
}));
vi.mock("./WaterTrackerCard", () => ({
  WaterTrackerCard: () => <div data-testid="water-card" />,
}));
const toastSuccess = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn(), info: vi.fn() }),
}));

import { NutritionDashboard } from "./NutritionDashboard";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";

const today = getKyivDayKey();

function logWith(kcal: number, protein = 0, fat = 0, carbs = 0) {
  return {
    [today]: {
      meals: [
        {
          id: "m1",
          time: "12:00",
          mealType: "lunch",
          name: "Обід",
          macros: { kcal, protein_g: protein, fat_g: fat, carbs_g: carbs },
        },
      ],
    },
  } as never;
}

const GOAL_PREFS = {
  dailyTargetKcal: 2000,
  dailyTargetProtein_g: 120,
  dailyTargetFat_g: 60,
  dailyTargetCarbs_g: 200,
  waterGoalMl: 2000,
} as never;

beforeEach(() => {
  localStorage.clear();
  toastSuccess.mockReset();
});

afterEach(() => vi.clearAllMocks());

describe("NutritionDashboard", () => {
  it("renders the kcal ring and macro bars when a goal is set", () => {
    render(
      <NutritionDashboard
        log={logWith(1000, 50, 20, 100)}
        prefs={GOAL_PREFS}
      />,
    );
    expect(screen.getByText("Сьогодні")).toBeInTheDocument();
    expect(screen.getByLabelText(/Калорії: 1000 з 2000/)).toBeInTheDocument();
    expect(screen.getByText("Білки")).toBeInTheDocument();
    expect(screen.getByTestId("water-card")).toBeInTheDocument();
  });

  it("renders the set-goal CTA when no goal is configured", () => {
    const onGoToDailyPlan = vi.fn();
    render(
      <NutritionDashboard
        log={logWith(0)}
        prefs={{ waterGoalMl: 2000 } as never}
        onGoToDailyPlan={onGoToDailyPlan}
      />,
    );
    expect(screen.getByText(/Встанови ціль калорій/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Налаштувати денні цілі/));
    expect(onGoToDailyPlan).toHaveBeenCalled();
  });

  it("invokes onAddMeal and onGoToLog callbacks", () => {
    const onAddMeal = vi.fn();
    const onGoToLog = vi.fn();
    render(
      <NutritionDashboard
        log={logWith(500)}
        prefs={GOAL_PREFS}
        onAddMeal={onAddMeal}
        onGoToLog={onGoToLog}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Додати прийом їжі" }));
    expect(onAddMeal).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Журнал →"));
    expect(onGoToLog).toHaveBeenCalled();
  });

  it("fires the daily-norm toast when kcal enters the 95-105% band", () => {
    render(
      <NutritionDashboard
        log={logWith(2000, 120, 60, 200)}
        prefs={GOAL_PREFS}
      />,
    );
    expect(toastSuccess).toHaveBeenCalledWith("Денну норму виконано");
  });

  it("renders the AI day-hint card when onFetchDayHint is provided", () => {
    const onFetchDayHint = vi.fn();
    render(
      <NutritionDashboard
        log={logWith(500)}
        prefs={GOAL_PREFS}
        onFetchDayHint={onFetchDayHint}
        dayHintText="Додай більше білка"
      />,
    );
    expect(screen.getByText("Підказка AI")).toBeInTheDocument();
    expect(screen.getByText("Додай більше білка")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Отримати"));
    expect(onFetchDayHint).toHaveBeenCalled();
  });
});

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
import { todayISODate } from "@sergeant/nutrition-domain";

// ADR-0078: NutritionDashboard's "today" macros card is device-local.
const today = todayISODate();

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

function logWithSources(entries: Array<{ kcal: number; macroSource: string }>) {
  return {
    [today]: {
      meals: entries.map((e, i) => ({
        id: `m${i + 1}`,
        time: "12:00",
        mealType: "lunch",
        name: `Прийом ${i + 1}`,
        macroSource: e.macroSource,
        macros: { kcal: e.kcal, protein_g: 0, fat_g: 0, carbs_g: 0 },
      })),
    },
  } as never;
}

function logWithMealCount(count: number) {
  return {
    [today]: {
      meals: Array.from({ length: count }, (_, i) => ({
        id: `m${i + 1}`,
        time: "12:00",
        mealType: "lunch",
        name: `Прийом ${i + 1}`,
        macros: { kcal: 300, protein_g: 20, fat_g: 10, carbs_g: 30 },
      })),
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
    const cta = screen.getByRole("button", {
      name: "Встановити денну ціль, щоб бачити прогрес",
    });
    expect(cta).toBeInTheDocument();
    expect(
      screen.queryByText(/Налаштувати денні цілі КБЖВ/),
    ).not.toBeInTheDocument();
    fireEvent.click(cta);
    expect(onGoToDailyPlan).toHaveBeenCalledTimes(1);
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
    fireEvent.click(screen.getByRole("button", { name: "Журнал" }));
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

  it("dashes the kcal ring on an incomplete day (fewer than 3 meals)", () => {
    render(<NutritionDashboard log={logWithMealCount(1)} prefs={GOAL_PREFS} />);
    const ring = screen.getByLabelText(/Калорії: 300 з 2000/);
    expect(ring.getAttribute("aria-label")).toContain("неповні дані за день");
    const track = ring.querySelectorAll("circle")[0];
    expect(track!.getAttribute("stroke-dasharray")).toBe("4 3");
  });

  it("renders a solid kcal ring once 3+ meals are logged", () => {
    render(<NutritionDashboard log={logWithMealCount(3)} prefs={GOAL_PREFS} />);
    const ring = screen.getByLabelText(/Калорії: 900 з 2000/);
    expect(ring.getAttribute("aria-label")).not.toContain(
      "неповні дані за день",
    );
    const track = ring.querySelectorAll("circle")[0];
    expect(track!.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("shows the ≈ badge and caption when photoAI kcal share is above 50% (nutrition audit E-5)", () => {
    render(
      <NutritionDashboard
        log={logWithSources([
          { kcal: 490, macroSource: "manual" },
          { kcal: 510, macroSource: "photoAI" },
        ])}
        prefs={GOAL_PREFS}
      />,
    );
    const ring = screen.getByLabelText(/Калорії: 1000 з 2000/);
    expect(ring.getAttribute("aria-label")).toContain(
      "переважно оцінка з фото",
    );
    expect(screen.getByText(/Більшість ккал сьогодні/)).toBeInTheDocument();
  });

  it("hides the ≈ badge when photoAI kcal share is exactly 50% (threshold is strictly >50%)", () => {
    render(
      <NutritionDashboard
        log={logWithSources([
          { kcal: 500, macroSource: "manual" },
          { kcal: 500, macroSource: "photoAI" },
        ])}
        prefs={GOAL_PREFS}
      />,
    );
    const ring = screen.getByLabelText(/Калорії: 1000 з 2000/);
    expect(ring.getAttribute("aria-label")).not.toContain(
      "переважно оцінка з фото",
    );
    expect(
      screen.queryByText(/Більшість ккал сьогодні/),
    ).not.toBeInTheDocument();
  });
});

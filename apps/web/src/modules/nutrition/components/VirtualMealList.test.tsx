// @vitest-environment jsdom
/**
 * Last validated: 2026-06-24
 * Status: Active
 * Unit tests for the virtualized grouped meal list. Virtuoso, SwipeToAction
 * and MealRow are stubbed so the test focuses on flattening + callbacks.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-virtuoso", () => ({
  Virtuoso: ({
    data,
    itemContent,
  }: {
    data: unknown[] | undefined;
    itemContent: (i: number, d: unknown) => ReactNode;
  }) => (
    <div data-testid="virtual-list">
      {(data || []).map((d, i) => (
        <div key={i}>{itemContent(i, d)}</div>
      ))}
    </div>
  ),
}));

vi.mock("@shared/components/ui/SwipeToAction", () => ({
  SwipeToAction: ({
    children,
    onSwipeLeft,
    rightLabel,
  }: {
    children: ReactNode;
    onSwipeLeft?: () => void;
    rightLabel?: ReactNode;
  }) => (
    <div>
      <button type="button" data-testid="swipe-left" onClick={onSwipeLeft}>
        swipe
      </button>
      <div data-testid="swipe-right-label">{rightLabel}</div>
      {children}
    </div>
  ),
}));

vi.mock("./MealRow", () => ({
  MealRow: ({
    meal,
    onEdit,
    onRemove,
  }: {
    meal: { name: string };
    onEdit?: () => void;
    onRemove?: () => void;
  }) => (
    <div>
      <span>{meal.name}</span>
      {onEdit && (
        <button
          type="button"
          data-testid={`edit-${meal.name}`}
          onClick={onEdit}
        >
          edit
        </button>
      )}
      <button
        type="button"
        data-testid={`remove-${meal.name}`}
        onClick={onRemove}
      >
        remove
      </button>
    </div>
  ),
}));

import { VirtualMealList } from "./VirtualMealList";
import type { Meal, MealTypeId } from "@sergeant/nutrition-domain";

function makeMeal(id: string, name: string): Meal {
  return {
    id,
    time: "12:00",
    name,
    mealType: "lunch",
    label: "",
    macros: { kcal: 100, protein_g: 5, fat_g: 2, carbs_g: 10 },
    source: "manual",
    macroSource: "manual",
    foodId: null,
    amount_g: null,
  } as Meal;
}

function emptyGroups(): Record<MealTypeId, Meal[]> {
  return {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  } as Record<MealTypeId, Meal[]>;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

describe("VirtualMealList", () => {
  it("renders only groups that have meals, with their headers", () => {
    const groups = emptyGroups();
    groups.lunch = [makeMeal("m1", "Борщ")];
    groups.dinner = [makeMeal("m2", "Риба")];
    const meals = [...groups.lunch, ...groups.dinner];

    render(
      <VirtualMealList
        groups={groups}
        meals={meals}
        selectedDate="2026-06-20"
      />,
    );
    expect(screen.getByText("Борщ")).toBeInTheDocument();
    expect(screen.getByText("Риба")).toBeInTheDocument();
    // Breakfast/snack groups are empty → no extra meals rendered.
    expect(screen.queryByText("Сніданок")).not.toBeInTheDocument();
  });

  it("fires onRemoveMeal from both the swipe action and the remove button", () => {
    const groups = emptyGroups();
    const meal = makeMeal("m1", "Борщ");
    groups.lunch = [meal];
    const onRemoveMeal = vi.fn();

    render(
      <VirtualMealList
        groups={groups}
        meals={[meal]}
        selectedDate="2026-06-20"
        onRemoveMeal={onRemoveMeal}
      />,
    );
    fireEvent.click(screen.getByTestId("remove-Борщ"));
    fireEvent.click(screen.getByTestId("swipe-left"));
    expect(onRemoveMeal).toHaveBeenCalledTimes(2);
    expect(onRemoveMeal).toHaveBeenCalledWith("2026-06-20", meal);
    expect(screen.getByTestId("swipe-right-label")).toHaveTextContent(
      "Видалити",
    );
    expect(screen.getByTestId("swipe-right-label")).not.toHaveTextContent("🗑");
  });

  it("wires onEditMeal only when an edit handler is provided", () => {
    const groups = emptyGroups();
    const meal = makeMeal("m1", "Борщ");
    groups.lunch = [meal];
    const onEditMeal = vi.fn();

    const { unmount } = render(
      <VirtualMealList
        groups={groups}
        meals={[meal]}
        selectedDate="2026-06-20"
        onEditMeal={onEditMeal}
      />,
    );
    fireEvent.click(screen.getByTestId("edit-Борщ"));
    expect(onEditMeal).toHaveBeenCalledWith("2026-06-20", meal);
    unmount();

    // Without onEditMeal the edit button is not rendered.
    render(
      <VirtualMealList
        groups={groups}
        meals={[meal]}
        selectedDate="2026-06-20"
      />,
    );
    expect(screen.queryByTestId("edit-Борщ")).not.toBeInTheDocument();
  });
});

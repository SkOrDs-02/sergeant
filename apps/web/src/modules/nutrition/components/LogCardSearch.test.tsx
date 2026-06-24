// @vitest-environment jsdom
/**
 * Last validated: 2026-06-24
 * Status: Active
 * Unit tests for the journal search sub-card.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/nutritionStorage", () => ({
  searchMealsByName: vi.fn(),
}));
vi.mock("../lib/mealId", () => ({
  newMealId: () => "meal_test_id",
}));

import { LogCardSearch } from "./LogCardSearch";
import { searchMealsByName } from "../lib/nutritionStorage";
import type { NutritionLog, Meal } from "@sergeant/nutrition-domain";

const searchMock = searchMealsByName as unknown as ReturnType<typeof vi.fn>;

const log = {} as NutritionLog;

function makeMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: "m1",
    time: "12:00",
    name: "Борщ",
    mealType: "lunch",
    label: "",
    macros: { kcal: 250, protein_g: 12, fat_g: 5, carbs_g: 30 },
    source: "manual",
    macroSource: "manual",
    foodId: null,
    amount_g: null,
    ...overrides,
  } as Meal;
}

beforeEach(() => {
  vi.useFakeTimers();
  searchMock.mockReset();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("LogCardSearch", () => {
  it("renders the search input and no list before typing", () => {
    render(<LogCardSearch log={log} setSelectedDate={vi.fn()} />);
    expect(screen.getByLabelText("Пошук по журналу")).toBeInTheDocument();
    // No results UL while query is empty.
    expect(screen.queryByText("Нічого не знайдено")).not.toBeInTheDocument();
  });

  it("debounces the query and shows the empty-state when no hits", () => {
    searchMock.mockReturnValue([]);
    render(<LogCardSearch log={log} setSelectedDate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Пошук по журналу"), {
      target: { value: "піца" },
    });
    // Before the debounce fires, searchMealsByName isn't called with the text.
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(searchMock).toHaveBeenCalledWith(log, "піца");
    expect(screen.getByText("Нічого не знайдено")).toBeInTheDocument();
  });

  it("renders hits and jumps to the date when a hit is clicked", () => {
    searchMock.mockReturnValue([{ date: "2026-06-20", meal: makeMeal() }]);
    const setSelectedDate = vi.fn();
    render(<LogCardSearch log={log} setSelectedDate={setSelectedDate} />);
    fireEvent.change(screen.getByLabelText("Пошук по журналу"), {
      target: { value: "борщ" },
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByText("Борщ")).toBeInTheDocument();
    expect(screen.getByText("250 ккал")).toBeInTheDocument();
    // Clicking the meal label navigates and clears the query.
    fireEvent.click(screen.getByText("Борщ"));
    expect(setSelectedDate).toHaveBeenCalledWith("2026-06-20");
    expect(
      (screen.getByLabelText("Пошук по журналу") as HTMLInputElement).value,
    ).toBe("");
  });

  it("re-adds a meal to the current day via the + button", () => {
    searchMock.mockReturnValue([{ date: "2026-06-20", meal: makeMeal() }]);
    const onAdd = vi.fn();
    render(
      <LogCardSearch
        log={log}
        setSelectedDate={vi.fn()}
        onAddMealFromSearch={onAdd}
      />,
    );
    fireEvent.change(screen.getByLabelText("Пошук по журналу"), {
      target: { value: "борщ" },
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    fireEvent.click(screen.getByLabelText(/Додати Борщ до поточного дня/));
    expect(onAdd).toHaveBeenCalledTimes(1);
    const added = onAdd.mock.calls[0]![0] as Meal;
    expect(added.id).toBe("meal_test_id");
    expect(added.name).toBe("Борщ");
    expect(added.source).toBe("manual");
  });
});

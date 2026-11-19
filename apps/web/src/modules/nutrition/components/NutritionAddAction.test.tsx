// @vitest-environment jsdom
/**
 * Last validated: 2026-11-18
 * Status: Active
 * Кнопка «+ Додати» Їжі: джерела і повтор над ними (OD-27 Х-3 а).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Meal, NutritionLog } from "@sergeant/nutrition-domain";
import type { ToastApi } from "@shared/hooks/useToast";
import { NutritionAddAction } from "./NutritionAddAction";

function meal(id: string, mealType: Meal["mealType"], kcal: number): Meal {
  return {
    id,
    name: id,
    time: "19:00",
    mealType,
    label: "",
    macros: { kcal, protein_g: 1, fat_g: 1, carbs_g: 1 },
    source: "manual",
    macroSource: "manual",
    amount_g: 100,
    foodId: null,
  };
}

function setup(nutritionLog: NutritionLog) {
  const log = {
    nutritionLog,
    getActiveDate: () => "2026-11-18",
    handleCopyMeals: vi.fn(() => ["c1"]),
    handleRemoveMeal: vi.fn(),
  };
  const toast = { show: vi.fn(), success: vi.fn() } as unknown as ToastApi;
  const onQuickAdd = vi.fn();
  const onOpenAt = vi.fn();
  render(
    <NutritionAddAction
      activePage="start"
      log={log}
      pantryItems={[]}
      toast={toast}
      onOpenAt={onOpenAt}
      onOpenPhoto={vi.fn()}
      onQuickAdd={onQuickAdd}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Додати" }));
  return { log, toast, onQuickAdd, onOpenAt };
}

describe("NutritionAddAction", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 18, 19, 40, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("«Як учора» бере вчорашню вечерю (тип за годинником) і копіює її в день", () => {
    const { log, toast } = setup({
      "2026-11-17": {
        meals: [meal("Омлет", "breakfast", 310), meal("Лосось", "dinner", 655)],
      },
      "2026-11-18": { meals: [meal("Йогурт", "breakfast", 118)] },
    });
    expect(screen.getByText("Лосось · 655 ккал")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Як учора/ }));
    expect(log.handleCopyMeals).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "Лосось" })],
      "2026-11-18",
      "dinner",
    );
    expect(toast.show).toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Додати" })).toBeNull();
  });

  it("чип «Нещодавні» записує одним тапом, без типу (його дасть годинник)", () => {
    const { onQuickAdd } = setup({
      "2026-11-18": { meals: [meal("Йогурт", "breakfast", 118)] },
    });
    expect(screen.queryByRole("button", { name: /Як учора/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Йогурт/ }));
    expect(onQuickAdd).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Йогурт" }),
    );
  });

  it("порожній журнал: лише джерела", () => {
    const { onOpenAt } = setup({});
    expect(screen.queryByText("Нещодавні")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Пошук продукту/ }));
    expect(onOpenAt).toHaveBeenCalledWith("search");
  });
});

// @vitest-environment jsdom
/**
 * Last validated: 2026-08-13
 * Status: Active
 * Unit tests for the `useNutritionPwaAction` PWA-shell action effect.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useNutritionPwaAction } from "./useNutritionPwaAction";

type Args = Parameters<typeof useNutritionPwaAction>[0];

function makeArgs(overrides: Partial<Args> = {}): Args {
  return {
    pwaAction: undefined,
    setActivePageAndHash: vi.fn(),
    onOpenAddMeal: vi.fn(),
    onOpenMealPhoto: vi.fn(),
    onPwaActionConsumed: vi.fn(),
    ...overrides,
  };
}

describe("useNutritionPwaAction", () => {
  it("does nothing for an undefined action", () => {
    const args = makeArgs();
    renderHook(() => useNutritionPwaAction(args));
    expect(args.setActivePageAndHash).not.toHaveBeenCalled();
    expect(args.onOpenAddMeal).not.toHaveBeenCalled();
    expect(args.onOpenMealPhoto).not.toHaveBeenCalled();
    expect(args.onPwaActionConsumed).not.toHaveBeenCalled();
  });

  it("handles add_meal: routes to log and opens the sheet via the host callback", () => {
    // Через onOpenAddMeal (не прямий setAddMealSheetOpen): хост скидає
    // initialStep sheet-а на "source" — інакше add_meal після
    // add_meal_photo відкривався б на кроці фото.
    const args = makeArgs({ pwaAction: "add_meal" });
    renderHook(() => useNutritionPwaAction(args));
    expect(args.setActivePageAndHash).toHaveBeenCalledWith("log");
    expect(args.onOpenAddMeal).toHaveBeenCalledTimes(1);
    expect(args.onOpenMealPhoto).not.toHaveBeenCalled();
    expect(args.onPwaActionConsumed).toHaveBeenCalledTimes(1);
  });

  it("handles add_meal_photo: routes to log and opens the sheet at the photo step", () => {
    // Фото це крок AddMealSheet: шорткат більше не навігує на «Огляд» і не
    // клікає file input синтетично — це робить сам крок при монтуванні.
    const args = makeArgs({ pwaAction: "add_meal_photo" });
    renderHook(() => useNutritionPwaAction(args));
    expect(args.setActivePageAndHash).toHaveBeenCalledWith("log");
    expect(args.onOpenMealPhoto).toHaveBeenCalledTimes(1);
    expect(args.onOpenAddMeal).not.toHaveBeenCalled();
    expect(args.onPwaActionConsumed).toHaveBeenCalledTimes(1);
  });

  it("add_meal after add_meal_photo goes through onOpenAddMeal (step reset regression)", () => {
    // Регресія залишкового кроку: обидва відкриття мають іти через хостові
    // колбеки, щоб хост міг виставити правильний initialStep на кожне.
    const args = makeArgs({ pwaAction: "add_meal_photo" });
    const { rerender } = renderHook(
      (props: Args) => useNutritionPwaAction(props),
      { initialProps: args },
    );
    expect(args.onOpenMealPhoto).toHaveBeenCalledTimes(1);

    rerender({ ...args, pwaAction: "add_meal" });
    expect(args.onOpenAddMeal).toHaveBeenCalledTimes(1);
    expect(args.onOpenMealPhoto).toHaveBeenCalledTimes(1);
  });

  it("ignores an unknown action", () => {
    const args = makeArgs({ pwaAction: "add_expense" });
    renderHook(() => useNutritionPwaAction(args));
    expect(args.setActivePageAndHash).not.toHaveBeenCalled();
    expect(args.onOpenAddMeal).not.toHaveBeenCalled();
    expect(args.onOpenMealPhoto).not.toHaveBeenCalled();
    expect(args.onPwaActionConsumed).not.toHaveBeenCalled();
  });
});

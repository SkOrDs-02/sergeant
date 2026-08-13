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
    log: { setAddMealSheetOpen: vi.fn() } as unknown as Args["log"],
    setActivePageAndHash: vi.fn(),
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
    expect(args.onOpenMealPhoto).not.toHaveBeenCalled();
    expect(args.onPwaActionConsumed).not.toHaveBeenCalled();
  });

  it("handles add_meal: routes to log and opens the sheet", () => {
    const args = makeArgs({ pwaAction: "add_meal" });
    renderHook(() => useNutritionPwaAction(args));
    expect(args.setActivePageAndHash).toHaveBeenCalledWith("log");
    expect(args.log.setAddMealSheetOpen).toHaveBeenCalledWith(true);
    expect(args.onOpenMealPhoto).not.toHaveBeenCalled();
    expect(args.onPwaActionConsumed).toHaveBeenCalledTimes(1);
  });

  it("handles add_meal_photo: routes to log and opens the sheet at the photo step", () => {
    // Фото — крок AddMealSheet: шорткат більше не навігує на «Огляд» і не
    // клікає file input синтетично — це робить сам крок при монтуванні.
    const args = makeArgs({ pwaAction: "add_meal_photo" });
    renderHook(() => useNutritionPwaAction(args));
    expect(args.setActivePageAndHash).toHaveBeenCalledWith("log");
    expect(args.onOpenMealPhoto).toHaveBeenCalledTimes(1);
    // Sheet-open належить onOpenMealPhoto (хост скидає крок) — хук не
    // дублює його прямим setAddMealSheetOpen.
    expect(args.log.setAddMealSheetOpen).not.toHaveBeenCalled();
    expect(args.onPwaActionConsumed).toHaveBeenCalledTimes(1);
  });

  it("ignores an unknown action", () => {
    const args = makeArgs({ pwaAction: "add_expense" });
    renderHook(() => useNutritionPwaAction(args));
    expect(args.setActivePageAndHash).not.toHaveBeenCalled();
    expect(args.onOpenMealPhoto).not.toHaveBeenCalled();
    expect(args.onPwaActionConsumed).not.toHaveBeenCalled();
  });
});

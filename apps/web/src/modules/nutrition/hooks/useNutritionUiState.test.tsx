// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the `useNutritionUiState` state-container hook.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useNutritionUiState } from "./useNutritionUiState";

describe("useNutritionUiState", () => {
  it("initializes every field to its documented default", () => {
    const { result } = renderHook(() => useNutritionUiState());
    const s = result.current;
    expect(s.editingMeal).toBeNull();
    expect(s.recipes).toEqual([]);
    expect(s.recipesTried).toBe(false);
    expect(s.recipesRaw).toBe("");
    expect(s.weekPlan).toBeNull();
    expect(s.weekPlanRaw).toBe("");
    expect(s.weekPlanBusy).toBe(false);
    expect(s.dayPlan).toBeNull();
    expect(s.dayPlanBusy).toBe(false);
    expect(s.shoppingBusy).toBe(false);
    expect(s.dayHintText).toBe("");
    expect(s.dayHintBusy).toBe(false);
    expect(s.cloudBackupBusy).toBe(false);
    expect(s.backupPasswordDialog).toBeNull();
    expect(s.restoreConfirm).toBeNull();
    expect(s.pantryScannerOpen).toBe(false);
    expect(s.pantryScanStatus).toBe("");
  });

  it("exposes working setters for representative fields", () => {
    const { result } = renderHook(() => useNutritionUiState());

    act(() => {
      result.current.setEditingMeal({ id: "m1", date: "2026-06-23" });
      result.current.setRecipes([{ title: "x" }]);
      result.current.setRecipesTried(true);
      result.current.setWeekPlanBusy(true);
      result.current.setDayPlan({ totalKcal: 1800 });
      result.current.setBackupPasswordDialog({ mode: "upload" });
      result.current.setRestoreConfirm({ payload: { a: 1 } });
      result.current.setPantryScannerOpen(true);
      result.current.setPantryScanStatus("Шукаю");
    });

    const s = result.current;
    expect(s.editingMeal).toEqual({ id: "m1", date: "2026-06-23" });
    expect(s.recipes).toEqual([{ title: "x" }]);
    expect(s.recipesTried).toBe(true);
    expect(s.weekPlanBusy).toBe(true);
    expect(s.dayPlan).toEqual({ totalKcal: 1800 });
    expect(s.backupPasswordDialog).toEqual({ mode: "upload" });
    expect(s.restoreConfirm).toEqual({ payload: { a: 1 } });
    expect(s.pantryScannerOpen).toBe(true);
    expect(s.pantryScanStatus).toBe("Шукаю");
  });
});

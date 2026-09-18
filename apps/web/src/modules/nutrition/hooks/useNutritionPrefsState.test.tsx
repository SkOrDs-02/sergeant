// @vitest-environment jsdom
/**
 * Last validated: 2026-06-24
 * Status: Active
 * Unit tests for the nutrition-prefs state hook (LS hydrate + SQLite overlay
 * + persist-error banner).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadNutritionPrefs = vi.fn();
const persistNutritionPrefs = vi.fn();
const getCachedNutritionSqliteState = vi.fn();

vi.mock("../lib/nutritionStorage", () => ({
  loadNutritionPrefs: () => loadNutritionPrefs(),
  persistNutritionPrefs: (...args: unknown[]) => persistNutritionPrefs(...args),
}));
vi.mock("../lib/sqliteReader", () => ({
  getCachedNutritionSqliteState: () => getCachedNutritionSqliteState(),
}));

import { useNutritionPrefsState } from "./useNutritionPrefsState";

const INITIAL = { goal: "maintain", kcalTarget: 2000 };
const OVERLAY = { goal: "cut", kcalTarget: 1700 };

beforeEach(() => {
  vi.clearAllMocks();
  loadNutritionPrefs.mockReturnValue(INITIAL);
  persistNutritionPrefs.mockReturnValue(true);
  getCachedNutritionSqliteState.mockReturnValue({ refreshedAt: null });
});
afterEach(() => vi.clearAllMocks());

describe("useNutritionPrefsState", () => {
  it("hydrates from localStorage and clears the error after a successful persist", () => {
    const { result } = renderHook(() => useNutritionPrefsState(0));
    expect(result.current.prefs).toEqual(INITIAL);
    // mount effect persists once, success → empty error string.
    expect(persistNutritionPrefs).toHaveBeenCalledWith(INITIAL);
    expect(result.current.prefsStorageErr).toBe("");
  });

  it("surfaces a banner string when persistence fails", async () => {
    persistNutritionPrefs.mockReturnValue(false);
    const { result } = renderHook(() => useNutritionPrefsState(0));
    await waitFor(() => {
      expect(result.current.prefsStorageErr).toBe(
        "Не вдалося зберегти налаштування.",
      );
    });
  });

  it("persists again whenever prefs change", () => {
    const { result } = renderHook(() => useNutritionPrefsState(0));
    persistNutritionPrefs.mockClear();
    act(() => {
      result.current.setPrefs(OVERLAY as never);
    });
    expect(persistNutritionPrefs).toHaveBeenCalledWith(OVERLAY);
    expect(result.current.prefs).toEqual(OVERLAY);
  });

  it("does not overlay when the SQLite cache is cold", () => {
    getCachedNutritionSqliteState.mockReturnValue({ refreshedAt: null });
    const { result, rerender } = renderHook(
      ({ tick }) => useNutritionPrefsState(tick),
      { initialProps: { tick: 0 } },
    );
    rerender({ tick: 1 });
    expect(result.current.prefs).toEqual(INITIAL);
  });

  it("overlays prefs from a warm SQLite cache when the tick changes", () => {
    getCachedNutritionSqliteState.mockReturnValue({
      refreshedAt: "2026-06-24T00:00:00Z",
      prefs: OVERLAY,
    });
    const { result, rerender } = renderHook(
      ({ tick }) => useNutritionPrefsState(tick),
      { initialProps: { tick: 0 } },
    );
    // Warm cache on mount — initial seed comes from the overlay reader.
    expect(result.current.prefs).toEqual(OVERLAY);
    rerender({ tick: 1 });
    expect(result.current.prefs).toEqual(OVERLAY);
  });
});

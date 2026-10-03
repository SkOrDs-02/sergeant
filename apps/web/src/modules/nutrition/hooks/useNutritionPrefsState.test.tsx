// @vitest-environment jsdom
/**
 * Last validated: 2026-10-03
 * Status: Active
 * Unit tests for the nutrition-prefs state hook (SQLite overlay + запис
 * патчем лише на дію користувача + persist-error banner).
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadLatestNutritionPrefs = vi.fn();
const patchNutritionPrefs = vi.fn();
const peekLastWrittenNutritionPrefs = vi.fn();
const isNutritionPrefsHydrated = vi.fn();
const getCachedNutritionSqliteState = vi.fn();

vi.mock("../lib/nutritionStorage", () => ({
  loadLatestNutritionPrefs: () => loadLatestNutritionPrefs(),
  patchNutritionPrefs: (...args: unknown[]) => patchNutritionPrefs(...args),
  peekLastWrittenNutritionPrefs: () => peekLastWrittenNutritionPrefs(),
  isNutritionPrefsHydrated: () => isNutritionPrefsHydrated(),
}));
vi.mock("../lib/sqliteReader", () => ({
  getCachedNutritionSqliteState: () => getCachedNutritionSqliteState(),
}));

import { useNutritionPrefsState } from "./useNutritionPrefsState";

const INITIAL = { goal: "maintain", kcalTarget: 2000, servings: 2 };
const OVERLAY = { goal: "cut", kcalTarget: 1700, servings: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  loadLatestNutritionPrefs.mockReturnValue(INITIAL);
  patchNutritionPrefs.mockReturnValue(true);
  peekLastWrittenNutritionPrefs.mockReturnValue(null);
  isNutritionPrefsHydrated.mockReturnValue(true);
  getCachedNutritionSqliteState.mockReturnValue({ refreshedAt: null });
});
afterEach(() => vi.clearAllMocks());

describe("useNutritionPrefsState", () => {
  it("hydrates synchronously and does NOT write on mount", () => {
    const { result } = renderHook(() => useNutritionPrefsState(0));
    expect(result.current.prefs).toEqual(INITIAL);
    expect(patchNutritionPrefs).not.toHaveBeenCalled();
    expect(result.current.prefsStorageErr).toBe("");
  });

  it("surfaces a banner string when the patch is rejected", () => {
    patchNutritionPrefs.mockReturnValue(false);
    const { result } = renderHook(() => useNutritionPrefsState(0));
    act(() => {
      result.current.setPrefs((p) => ({ ...p, goal: "cut" }) as never);
    });
    expect(result.current.prefsStorageErr).toBe(
      "Не вдалося зберегти налаштування.",
    );
    expect(result.current.prefs).toEqual(INITIAL);
  });

  it("writes only the changed fields as a patch and updates state", () => {
    const { result } = renderHook(() => useNutritionPrefsState(0));
    act(() => {
      result.current.setPrefs(OVERLAY as never);
    });
    expect(patchNutritionPrefs).toHaveBeenCalledWith({
      goal: "cut",
      kcalTarget: 1700,
    });
    expect(result.current.prefs).toEqual(OVERLAY);
  });

  it("functional updaters receive the latest stored prefs, not component state", () => {
    const { result } = renderHook(() => useNutritionPrefsState(0));
    // Автокалібрування (чи інший пристрій) змінило сховище після рендера.
    loadLatestNutritionPrefs.mockReturnValue({ ...INITIAL, kcalTarget: 2710 });
    act(() => {
      result.current.setPrefs((p) => ({ ...p, goal: "cut" }) as never);
    });
    // kcalTarget не входить у патч: чужа свіжа зміна не відкочується.
    expect(patchNutritionPrefs).toHaveBeenCalledWith({ goal: "cut" });
  });

  it("does not write when nothing changed", () => {
    const { result } = renderHook(() => useNutritionPrefsState(0));
    act(() => {
      result.current.setPrefs((p) => ({ ...p }));
    });
    expect(patchNutritionPrefs).not.toHaveBeenCalled();
  });

  it("before hydration setPrefs neither writes nor changes state, only shows the banner", () => {
    isNutritionPrefsHydrated.mockReturnValue(false);
    const { result } = renderHook(() => useNutritionPrefsState(0));
    act(() => {
      result.current.setPrefs(OVERLAY as never);
    });
    expect(patchNutritionPrefs).not.toHaveBeenCalled();
    expect(result.current.prefs).toEqual(INITIAL);
    expect(result.current.prefsStorageErr).toBe(
      "Дані Їжі ще завантажуються. Спробуй за кілька секунд.",
    );
  });

  it("does not overlay when the SQLite cache is cold", () => {
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
    expect(result.current.prefs).toEqual(OVERLAY);
    rerender({ tick: 1 });
    expect(result.current.prefs).toEqual(OVERLAY);
    expect(patchNutritionPrefs).not.toHaveBeenCalled();
  });
});

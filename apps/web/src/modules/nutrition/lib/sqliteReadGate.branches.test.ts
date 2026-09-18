// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Branch-focused tests for Nutrition SQLite read-path gate.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  __closeNutritionSqliteMutationWindow,
  __openNutritionSqliteMutationWindow,
  __resetNutritionSqliteReadGateForTests,
  notifyNutritionSqliteCacheRefresh,
  useNutritionSqliteReadTick,
} from "./sqliteReadGate";

afterEach(() => {
  __resetNutritionSqliteReadGateForTests();
});

describe("notifyNutritionSqliteCacheRefresh", () => {
  it("bumps tick when no mutation window is open", () => {
    const { result } = renderHook(() => useNutritionSqliteReadTick());
    expect(result.current).toBe(0);

    act(() => notifyNutritionSqliteCacheRefresh());
    expect(result.current).toBe(1);
  });

  it("defers notify while a mutation window is open", () => {
    const { result } = renderHook(() => useNutritionSqliteReadTick());

    act(() => {
      __openNutritionSqliteMutationWindow();
      notifyNutritionSqliteCacheRefresh();
    });
    expect(result.current).toBe(0);

    act(() => {
      __closeNutritionSqliteMutationWindow();
      notifyNutritionSqliteCacheRefresh();
    });
    expect(result.current).toBe(1);
  });

  it("does not decrement pending windows below zero", () => {
    act(() => {
      __closeNutritionSqliteMutationWindow();
      notifyNutritionSqliteCacheRefresh();
    });
    const { result } = renderHook(() => useNutritionSqliteReadTick());
    expect(result.current).toBe(1);
  });

  it("increments global refresh counter on notify", () => {
    const target = globalThis as typeof globalThis & {
      __sergeantSqliteRefreshCounts?: Record<string, number>;
    };
    const before = target.__sergeantSqliteRefreshCounts?.["nutrition"] ?? 0;
    act(() => notifyNutritionSqliteCacheRefresh());
    expect(target.__sergeantSqliteRefreshCounts?.["nutrition"]).toBe(
      before + 1,
    );
  });
});

describe("__resetNutritionSqliteReadGateForTests", () => {
  it("clears tick and pending windows", () => {
    act(() => {
      __openNutritionSqliteMutationWindow();
      notifyNutritionSqliteCacheRefresh();
      __resetNutritionSqliteReadGateForTests();
    });
    const { result } = renderHook(() => useNutritionSqliteReadTick());
    expect(result.current).toBe(0);
  });
});

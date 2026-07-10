// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Unit tests for the Nutrition SQLite read-path gate (tick pub-sub +
 * mutation-window deferral).
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __closeNutritionSqliteMutationWindow,
  __openNutritionSqliteMutationWindow,
  __resetNutritionSqliteReadGateForTests,
  notifyNutritionSqliteCacheRefresh,
  useNutritionSqliteReadTick,
} from "./sqliteReadGate";

beforeEach(() => {
  __resetNutritionSqliteReadGateForTests();
});
afterEach(() => {
  __resetNutritionSqliteReadGateForTests();
});

describe("useNutritionSqliteReadTick + notifyNutritionSqliteCacheRefresh", () => {
  it("starts at zero", () => {
    const { result } = renderHook(() => useNutritionSqliteReadTick());
    expect(result.current).toBe(0);
  });

  it("bumps the tick on every notify call", () => {
    const { result } = renderHook(() => useNutritionSqliteReadTick());
    expect(result.current).toBe(0);

    act(() => {
      notifyNutritionSqliteCacheRefresh();
    });
    expect(result.current).toBe(1);

    act(() => {
      notifyNutritionSqliteCacheRefresh();
      notifyNutritionSqliteCacheRefresh();
    });
    expect(result.current).toBe(3);
  });

  it("notifies multiple subscribers on every refresh", () => {
    const a = renderHook(() => useNutritionSqliteReadTick());
    const b = renderHook(() => useNutritionSqliteReadTick());

    act(() => {
      notifyNutritionSqliteCacheRefresh();
    });
    expect(a.result.current).toBe(1);
    expect(b.result.current).toBe(1);
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

  it("defers notify until all nested mutation windows close", () => {
    const { result } = renderHook(() => useNutritionSqliteReadTick());

    act(() => {
      __openNutritionSqliteMutationWindow();
      __openNutritionSqliteMutationWindow();
      notifyNutritionSqliteCacheRefresh();
    });
    expect(result.current).toBe(0);

    act(() => {
      __closeNutritionSqliteMutationWindow();
      notifyNutritionSqliteCacheRefresh();
    });
    expect(result.current).toBe(0);

    act(() => {
      __closeNutritionSqliteMutationWindow();
      notifyNutritionSqliteCacheRefresh();
    });
    expect(result.current).toBe(1);
  });

  it("increments the browser-test refresh counter on notify", () => {
    const target = globalThis as typeof globalThis & {
      __sergeantSqliteRefreshCounts?: Record<string, number>;
    };
    const before = target.__sergeantSqliteRefreshCounts?.["nutrition"] ?? 0;

    act(() => {
      notifyNutritionSqliteCacheRefresh();
    });

    expect(target.__sergeantSqliteRefreshCounts?.["nutrition"]).toBe(
      before + 1,
    );
  });
});

// @vitest-environment jsdom
/**
 * Last validated: 2026-10-22
 * Status: Active
 * rel-10: порожня комора до першого pull = «синхронізую», з виходами
 * (завершений pull, анонімний режим, офлайн, таймаут).
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetInitialPullStateForTests,
  markInitialPullComplete,
} from "../../../core/syncEngine/initialPullState.js";
import {
  PANTRY_FIRST_PULL_WAIT_MS,
  usePantryFirstPullPending,
} from "./usePantryFirstPullPending";

const mocks = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("../lib/sqliteWriter/index.js", async (orig) => ({
  ...(await orig<object>()),
  getNutritionDualWriteUserId: () => mocks.userId,
}));

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("usePantryFirstPullPending", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetInitialPullStateForTests();
    mocks.userId = "user-1";
    setOnline(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    setOnline(true);
  });

  it("чекає, поки перший pull не завершився", () => {
    const { result } = renderHook(() => usePantryFirstPullPending());
    expect(result.current).toBe(true);
  });

  it("знімає очікування, коли pull завершився", () => {
    const { result } = renderHook(() => usePantryFirstPullPending());
    act(() => markInitialPullComplete("user-1", {}));
    expect(result.current).toBe(false);
  });

  it("анонімний режим не чекає ніколи", () => {
    mocks.userId = "local-anon";
    const { result } = renderHook(() => usePantryFirstPullPending());
    expect(result.current).toBe(false);
  });

  it("офлайн не чекає", () => {
    setOnline(false);
    const { result } = renderHook(() => usePantryFirstPullPending());
    expect(result.current).toBe(false);
  });

  it("не крутиться вічно: після таймаута повертає порожній стан", () => {
    const { result } = renderHook(() => usePantryFirstPullPending());
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(PANTRY_FIRST_PULL_WAIT_MS + 1);
    });
    expect(result.current).toBe(false);
  });
});

// @vitest-environment jsdom
/**
 * Last validated: 2026-06-24
 * Status: Active
 * Unit tests for the SQLite read-path boot hook.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.fn();
const bootMock = vi.fn();
const notifyMock = vi.fn();
const cache = vi.hoisted(() => ({ refreshedAt: null as string | null }));

vi.mock("../../../core/auth/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("../lib/sqliteReadBoot", () => ({
  bootNutritionSqliteReadPath: (...args: unknown[]) => bootMock(...args),
}));
vi.mock("../lib/sqliteReadGate", () => ({
  notifyNutritionSqliteCacheRefresh: () => notifyMock(),
}));
vi.mock("../lib/sqliteReader", () => ({
  getCachedNutritionSqliteState: () => ({ refreshedAt: cache.refreshedAt }),
}));

import {
  __setNutritionReadBootSettledForTests,
  isNutritionReadCacheSettled,
  useNutritionSqliteReadBoot,
} from "./useNutritionSqliteReadBoot";

beforeEach(() => {
  vi.clearAllMocks();
  __setNutritionReadBootSettledForTests(false);
  cache.refreshedAt = null;
  bootMock.mockResolvedValue(true);
});
afterEach(() => vi.clearAllMocks());

describe("useNutritionSqliteReadBoot", () => {
  it("boots under the anonymous id when there is no signed-in user", async () => {
    // Regression: a meal logged before signing in was never read back
    // after reload.
    useAuthMock.mockReturnValue({ user: null, status: "unauthenticated" });

    renderHook(() => useNutritionSqliteReadBoot());

    await waitFor(() => {
      expect(bootMock).toHaveBeenCalledWith("local-anon");
    });
  });

  it("does nothing while the session is still resolving", () => {
    useAuthMock.mockReturnValue({ user: null, status: "loading" });
    renderHook(() => useNutritionSqliteReadBoot());
    expect(bootMock).not.toHaveBeenCalled();
  });

  it("boots the read path once and notifies consumers when activated", async () => {
    useAuthMock.mockReturnValue({ user: { id: "u1" } });
    const { rerender } = renderHook(() => useNutritionSqliteReadBoot());
    await waitFor(() => expect(notifyMock).toHaveBeenCalledTimes(1));
    expect(bootMock).toHaveBeenCalledWith("u1");
    // Re-render must not re-boot — the ref guard holds.
    rerender();
    expect(bootMock).toHaveBeenCalledTimes(1);
  });

  it("is not settled before the first render boots, so the start page shows a skeleton", () => {
    expect(isNutritionReadCacheSettled()).toBe(false);
  });

  it("settles and notifies even when boot was not activated", async () => {
    bootMock.mockResolvedValue(false);
    useAuthMock.mockReturnValue({ user: { id: "u2" } });
    renderHook(() => useNutritionSqliteReadBoot());
    await waitFor(() => expect(notifyMock).toHaveBeenCalledTimes(1));
    expect(isNutritionReadCacheSettled()).toBe(true);
  });

  it("settles after a rejected boot instead of holding the skeleton", async () => {
    bootMock.mockRejectedValue(new Error("no wasm"));
    useAuthMock.mockReturnValue({ user: { id: "u3" } });
    renderHook(() => useNutritionSqliteReadBoot());
    await waitFor(() => expect(isNutritionReadCacheSettled()).toBe(true));
  });

  it("counts a warm cache as settled while the boot is still running", () => {
    cache.refreshedAt = "2026-09-28T08:00:00.000Z";
    expect(isNutritionReadCacheSettled()).toBe(true);
  });
});

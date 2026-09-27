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

vi.mock("../../../core/auth/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("../lib/sqliteReadBoot", () => ({
  bootNutritionSqliteReadPath: (...args: unknown[]) => bootMock(...args),
}));
vi.mock("../lib/sqliteReadGate", () => ({
  notifyNutritionSqliteCacheRefresh: () => notifyMock(),
}));

import {
  __setNutritionReadBootInFlightForTests,
  isNutritionReadBootInFlight,
  useNutritionSqliteReadBoot,
} from "./useNutritionSqliteReadBoot";

beforeEach(() => {
  vi.clearAllMocks();
  __setNutritionReadBootInFlightForTests(false);
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

  it("notifies even when boot was not activated, so the start skeleton clears", async () => {
    bootMock.mockResolvedValue(false);
    useAuthMock.mockReturnValue({ user: { id: "u2" } });
    renderHook(() => useNutritionSqliteReadBoot());
    await waitFor(() => expect(notifyMock).toHaveBeenCalledTimes(1));
    expect(isNutritionReadBootInFlight()).toBe(false);
  });

  it("stays in flight while any boot is pending, even if a latched one returns first", async () => {
    // Хук стоїть і в NutritionBootCluster, і в NutritionApp; другий бут
    // упирається в латч і вертається одразу.
    let finishFirst: (v: boolean) => void = () => {};
    bootMock
      .mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
          finishFirst = resolve;
        }),
      )
      .mockResolvedValueOnce(false);
    useAuthMock.mockReturnValue({ user: { id: "u3" } });
    renderHook(() => useNutritionSqliteReadBoot());
    renderHook(() => useNutritionSqliteReadBoot());
    await waitFor(() => expect(notifyMock).toHaveBeenCalledTimes(1));
    expect(isNutritionReadBootInFlight()).toBe(true);
    finishFirst(true);
    await waitFor(() => expect(isNutritionReadBootInFlight()).toBe(false));
  });
});

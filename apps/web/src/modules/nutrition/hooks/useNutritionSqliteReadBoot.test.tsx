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

import { useNutritionSqliteReadBoot } from "./useNutritionSqliteReadBoot";

beforeEach(() => {
  vi.clearAllMocks();
  bootMock.mockResolvedValue(true);
});
afterEach(() => vi.clearAllMocks());

describe("useNutritionSqliteReadBoot", () => {
  it("does nothing when there is no signed-in user", () => {
    useAuthMock.mockReturnValue({ user: null });
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

  it("does not notify when boot reports it was not activated", async () => {
    bootMock.mockResolvedValue(false);
    useAuthMock.mockReturnValue({ user: { id: "u2" } });
    renderHook(() => useNutritionSqliteReadBoot());
    await waitFor(() => expect(bootMock).toHaveBeenCalledTimes(1));
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

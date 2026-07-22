// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const useAuthMock = vi.fn();
const bootMock = vi.fn();
const notifyMock = vi.fn();

vi.mock("../../../core/auth/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("../lib/sqliteReadBoot", () => ({
  bootFinykSqliteReadPath: (...a: unknown[]) => bootMock(...a),
}));
vi.mock("../lib/sqliteReadGate", () => ({
  notifyFinykSqliteCacheRefresh: () => notifyMock(),
}));

import { useFinykSqliteReadBoot } from "./useFinykSqliteReadBoot";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useFinykSqliteReadBoot", () => {
  it("boots under the anonymous id without an authenticated user", async () => {
    // Regression: this hook gated on a real account id, so an expense
    // added before signing in was never read back after reload.
    useAuthMock.mockReturnValue({ user: null, status: "unauthenticated" });
    bootMock.mockResolvedValue(false);

    renderHook(() => useFinykSqliteReadBoot());

    await waitFor(() => {
      expect(bootMock).toHaveBeenCalledWith("local-anon");
    });
  });

  it("does not boot while the session is still resolving", () => {
    useAuthMock.mockReturnValue({ user: null, status: "loading" });
    renderHook(() => useFinykSqliteReadBoot());
    expect(bootMock).not.toHaveBeenCalled();
  });

  it("boots once and notifies the cache gate when the path activates", async () => {
    useAuthMock.mockReturnValue({ user: { id: "u1" } });
    bootMock.mockResolvedValue(true);

    const { rerender } = renderHook(() => useFinykSqliteReadBoot());
    await waitFor(() => {
      expect(bootMock).toHaveBeenCalledWith("u1");
    });
    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalled();
    });

    // Re-render must not re-boot (ref-guarded).
    rerender();
    expect(bootMock).toHaveBeenCalledTimes(1);
  });

  it("does not notify when boot returns false", async () => {
    useAuthMock.mockReturnValue({ user: { id: "u2" } });
    bootMock.mockResolvedValue(false);

    renderHook(() => useFinykSqliteReadBoot());
    await waitFor(() => {
      expect(bootMock).toHaveBeenCalledWith("u2");
    });
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

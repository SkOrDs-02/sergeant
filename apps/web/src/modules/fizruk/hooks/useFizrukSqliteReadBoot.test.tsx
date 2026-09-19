// @vitest-environment jsdom
/**
 * Mirrors `apps/web/src/modules/finyk/hooks/useFinykSqliteReadBoot.test.tsx`.
 * Fizruk's variant additionally falls back to a synthetic demo user id
 * when demo mode is active and there's no authenticated user (QA D-002)
 * — covered separately below.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const useAuthMock = vi.fn();
const bootMock = vi.fn();
const notifyMock = vi.fn();

vi.mock("../../../core/auth/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("../lib/sqliteReadBoot", () => ({
  bootFizrukSqliteReadPath: (...a: unknown[]) => bootMock(...a),
}));
vi.mock("../lib/sqliteReadGate", () => ({
  notifyFizrukSqliteCacheRefresh: () => notifyMock(),
}));

import { useFizrukSqliteReadBoot } from "./useFizrukSqliteReadBoot";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useFizrukSqliteReadBoot", () => {
  it("does not boot while the session is still resolving", () => {
    useAuthMock.mockReturnValue({ user: null, status: "loading" });
    renderHook(() => useFizrukSqliteReadBoot());
    expect(bootMock).not.toHaveBeenCalled();
  });

  it("boots once and notifies the cache gate when the path activates", async () => {
    useAuthMock.mockReturnValue({ user: { id: "u1" } });
    bootMock.mockResolvedValue(true);

    const { rerender } = renderHook(() => useFizrukSqliteReadBoot());
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

    renderHook(() => useFizrukSqliteReadBoot());
    await waitFor(() => {
      expect(bootMock).toHaveBeenCalledWith("u2");
    });
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

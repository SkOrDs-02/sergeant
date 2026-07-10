// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const bootMock = vi.fn();
const teardown = vi.fn();

let authUser: { id: string } | null = null;

vi.mock("../../../core/auth/AuthContext", () => ({
  useAuth: () => ({ user: authUser }),
}));
vi.mock("../lib/dualWriteBoot.js", () => ({
  bootFinykDualWrite: (...args: unknown[]) => bootMock(...args),
}));

import { useFinykDualWriteBoot } from "./useFinykDualWriteBoot";

beforeEach(() => {
  vi.clearAllMocks();
  authUser = null;
  bootMock.mockReturnValue(teardown);
});

afterEach(() => {
  authUser = null;
});

describe("useFinykDualWriteBoot", () => {
  it("does not register dual-write when user is signed out", () => {
    renderHook(() => useFinykDualWriteBoot());
    expect(bootMock).not.toHaveBeenCalled();
  });

  it("registers dual-write for a signed-in user and tears down on unmount", () => {
    authUser = { id: "finyk-u1" };
    const { unmount } = renderHook(() => useFinykDualWriteBoot());

    expect(bootMock).toHaveBeenCalledTimes(1);
    const ctx = bootMock.mock.calls[0]![0] as { getUserId: () => string };
    expect(ctx.getUserId()).toBe("finyk-u1");

    unmount();
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it("re-registers when userId changes", () => {
    authUser = { id: "u-a" };
    const { rerender } = renderHook(() => useFinykDualWriteBoot());
    expect(bootMock).toHaveBeenCalledTimes(1);

    authUser = { id: "u-b" };
    rerender();
    expect(bootMock).toHaveBeenCalledTimes(2);
    expect(teardown).toHaveBeenCalledTimes(1);
  });
});

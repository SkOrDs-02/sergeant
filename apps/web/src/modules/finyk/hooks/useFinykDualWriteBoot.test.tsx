// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const bootMock = vi.fn();
const teardown = vi.fn();

let authUser: { id: string } | null = null;
let authStatus = "unauthenticated";

vi.mock("../../../core/auth/AuthContext", () => ({
  useAuth: () => ({ user: authUser, status: authStatus }),
}));
vi.mock("../lib/dualWriteBoot.js", () => ({
  bootFinykDualWrite: (...args: unknown[]) => bootMock(...args),
}));

import { useFinykDualWriteBoot } from "./useFinykDualWriteBoot";

beforeEach(() => {
  vi.clearAllMocks();
  authUser = null;
  authStatus = "unauthenticated";
  bootMock.mockReturnValue(teardown);
});

afterEach(() => {
  authUser = null;
  authStatus = "unauthenticated";
});

describe("useFinykDualWriteBoot", () => {
  it("registers dual-write under the anonymous id when signed out", () => {
    // Regression: an anonymous visitor's first expense used to reach
    // the warm cache only, and disappeared on reload.
    renderHook(() => useFinykDualWriteBoot());

    expect(bootMock).toHaveBeenCalledTimes(1);
    const ctx = bootMock.mock.calls[0]![0] as { getUserId: () => string };
    expect(ctx.getUserId()).toBe("local-anon");
  });

  it("does not register dual-write while the session is still resolving", () => {
    authStatus = "loading";
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

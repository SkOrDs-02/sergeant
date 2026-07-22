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
  bootRoutineDualWrite: (...args: unknown[]) => bootMock(...args),
}));

import { useRoutineDualWriteBoot } from "./useRoutineDualWriteBoot";

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

describe("useRoutineDualWriteBoot", () => {
  it("registers dual-write under the anonymous id when signed out", () => {
    // Regression: dual-write used to stay dormant for anonymous
    // visitors, so `triggerRoutineDualWrite` no-opped and the new habit
    // never reached SQLite — it survived only until the next reload.
    renderHook(() => useRoutineDualWriteBoot());

    expect(bootMock).toHaveBeenCalledTimes(1);
    const ctx = bootMock.mock.calls[0]![0] as { getUserId: () => string };
    expect(ctx.getUserId()).toBe("local-anon");
  });

  it("leaves dual-write dormant while the session is still resolving", () => {
    authStatus = "loading";
    renderHook(() => useRoutineDualWriteBoot());
    expect(bootMock).not.toHaveBeenCalled();
  });

  it("registers routine dual-write and tears down on unmount", () => {
    authUser = { id: "routine-u1" };
    const { unmount } = renderHook(() => useRoutineDualWriteBoot());

    expect(bootMock).toHaveBeenCalledTimes(1);
    const ctx = bootMock.mock.calls[0]![0] as { getUserId: () => string };
    expect(ctx.getUserId()).toBe("routine-u1");

    unmount();
    expect(teardown).toHaveBeenCalledTimes(1);
  });
});

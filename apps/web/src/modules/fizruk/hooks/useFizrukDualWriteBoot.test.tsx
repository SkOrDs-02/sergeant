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
  bootFizrukDualWrite: (...args: unknown[]) => bootMock(...args),
}));

import { useFizrukDualWriteBoot } from "./useFizrukDualWriteBoot";

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

describe("useFizrukDualWriteBoot", () => {
  it("boots under the anonymous id when there is no authenticated user", () => {
    // Regression: anonymous writes never reached SQLite, so a workout
    // logged before signing in vanished on reload.
    renderHook(() => useFizrukDualWriteBoot());

    expect(bootMock).toHaveBeenCalledTimes(1);
    const ctx = bootMock.mock.calls[0]![0] as { getUserId: () => string };
    expect(ctx.getUserId()).toBe("local-anon");
  });

  it("skips boot while the session is still resolving", () => {
    authStatus = "loading";
    renderHook(() => useFizrukDualWriteBoot());
    expect(bootMock).not.toHaveBeenCalled();
  });

  it("boots with live getUserId and runs teardown on unmount", () => {
    authUser = { id: "fizruk-u1" };
    const { unmount } = renderHook(() => useFizrukDualWriteBoot());

    expect(bootMock).toHaveBeenCalledTimes(1);
    const ctx = bootMock.mock.calls[0]![0] as { getUserId: () => string };
    expect(ctx.getUserId()).toBe("fizruk-u1");

    unmount();
    expect(teardown).toHaveBeenCalledTimes(1);
  });
});

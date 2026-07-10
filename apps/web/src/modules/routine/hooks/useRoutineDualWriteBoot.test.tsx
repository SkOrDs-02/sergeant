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
  bootRoutineDualWrite: (...args: unknown[]) => bootMock(...args),
}));

import { useRoutineDualWriteBoot } from "./useRoutineDualWriteBoot";

beforeEach(() => {
  vi.clearAllMocks();
  authUser = null;
  bootMock.mockReturnValue(teardown);
});

afterEach(() => {
  authUser = null;
});

describe("useRoutineDualWriteBoot", () => {
  it("leaves dual-write dormant when signed out", () => {
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

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
  bootFizrukDualWrite: (...args: unknown[]) => bootMock(...args),
}));

import { useFizrukDualWriteBoot } from "./useFizrukDualWriteBoot";

beforeEach(() => {
  vi.clearAllMocks();
  authUser = null;
  bootMock.mockReturnValue(teardown);
});

afterEach(() => {
  authUser = null;
});

describe("useFizrukDualWriteBoot", () => {
  it("skips boot when there is no authenticated user", () => {
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

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
  bootNutritionDualWrite: (...args: unknown[]) => bootMock(...args),
}));

import { useNutritionDualWriteBoot } from "./useNutritionDualWriteBoot";

beforeEach(() => {
  vi.clearAllMocks();
  authUser = null;
  bootMock.mockReturnValue(teardown);
});

afterEach(() => {
  authUser = null;
});

describe("useNutritionDualWriteBoot", () => {
  it("does not boot when userId is null", () => {
    renderHook(() => useNutritionDualWriteBoot());
    expect(bootMock).not.toHaveBeenCalled();
  });

  it("boots nutrition dual-write for signed-in users", () => {
    authUser = { id: "nutrition-u1" };
    const { unmount } = renderHook(() => useNutritionDualWriteBoot());

    expect(bootMock).toHaveBeenCalledTimes(1);
    const ctx = bootMock.mock.calls[0]![0] as { getUserId: () => string };
    expect(ctx.getUserId()).toBe("nutrition-u1");

    unmount();
    expect(teardown).toHaveBeenCalledTimes(1);
  });
});

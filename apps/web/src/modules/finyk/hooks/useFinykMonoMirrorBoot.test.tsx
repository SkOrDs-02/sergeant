// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const useAuthMock = vi.fn();
const bootMock = vi.fn();
const notifyMock = vi.fn();

vi.mock("../../../core/auth/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("../lib/monoMirrorBoot", () => ({
  bootFinykMonoMirror: (...a: unknown[]) => bootMock(...a),
}));
vi.mock("../lib/monoMirrorGate", () => ({
  notifyFinykMonoMirrorRefresh: () => notifyMock(),
}));

import { useFinykMonoMirrorBoot } from "./useFinykMonoMirrorBoot";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useFinykMonoMirrorBoot", () => {
  it("does not boot without a user", () => {
    useAuthMock.mockReturnValue({ user: null });
    renderHook(() => useFinykMonoMirrorBoot());
    expect(bootMock).not.toHaveBeenCalled();
  });

  it("boots once and notifies the gate when activated", async () => {
    useAuthMock.mockReturnValue({ user: { id: "u1" } });
    bootMock.mockResolvedValue(true);
    const { rerender } = renderHook(() => useFinykMonoMirrorBoot());
    await waitFor(() => expect(bootMock).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(notifyMock).toHaveBeenCalled());
    rerender();
    expect(bootMock).toHaveBeenCalledTimes(1);
  });

  it("does not notify when boot returns false", async () => {
    useAuthMock.mockReturnValue({ user: { id: "u2" } });
    bootMock.mockResolvedValue(false);
    renderHook(() => useFinykMonoMirrorBoot());
    await waitFor(() => expect(bootMock).toHaveBeenCalledWith("u2"));
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

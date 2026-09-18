/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ─── Collaborator mocks ───────────────────────────────────────────────────────

const {
  useFinykSqliteReadBootMock,
  useSqliteReadBootMock,
  bootFinykDualWriteMock,
  useAuthMock,
} = vi.hoisted(() => ({
  useFinykSqliteReadBootMock: vi.fn(),
  useSqliteReadBootMock: vi.fn(),
  bootFinykDualWriteMock: vi.fn(),
  useAuthMock: vi.fn(() => ({ user: null })),
}));

vi.mock("../../auth/AuthContext", () => ({
  useAuth: useAuthMock,
}));

vi.mock("../../../modules/finyk/hooks/useFinykSqliteReadBoot", () => ({
  useFinykSqliteReadBoot: useFinykSqliteReadBootMock,
}));

vi.mock("../../../modules/routine/hooks/useSqliteReadBoot", () => ({
  useSqliteReadBoot: useSqliteReadBootMock,
}));

vi.mock("../../../modules/finyk/lib/dualWriteBoot", () => ({
  bootFinykDualWrite: bootFinykDualWriteMock,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { useHubChatStorageBoot } from "./useHubChatStorageBoot";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useHubChatStorageBoot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: null });
  });

  it("always calls the finyk sqlite read boot", () => {
    renderHook(() => useHubChatStorageBoot());
    expect(useFinykSqliteReadBootMock).toHaveBeenCalled();
  });

  it("always calls the routine sqlite read boot", () => {
    renderHook(() => useHubChatStorageBoot());
    expect(useSqliteReadBootMock).toHaveBeenCalled();
  });

  it("does NOT register dual-write when user is null", () => {
    renderHook(() => useHubChatStorageBoot());
    expect(bootFinykDualWriteMock).not.toHaveBeenCalled();
  });

  it("registers finyk dual-write once when a user is present", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useAuthMock.mockReturnValue({ user: { id: "user-abc" } } as any);
    renderHook(() => useHubChatStorageBoot());
    expect(bootFinykDualWriteMock).toHaveBeenCalledTimes(1);
    expect(bootFinykDualWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({ getUserId: expect.any(Function) }),
    );
  });

  it("getUserId closure returns current userId", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useAuthMock.mockReturnValue({ user: { id: "user-xyz" } } as any);
    renderHook(() => useHubChatStorageBoot());
    const { getUserId } = bootFinykDualWriteMock.mock.calls[0]?.[0] as {
      getUserId: () => string | null;
    };
    expect(getUserId()).toBe("user-xyz");
  });

  it("does NOT register dual-write a second time on re-render", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useAuthMock.mockReturnValue({ user: { id: "user-abc" } } as any);
    const { rerender } = renderHook(() => useHubChatStorageBoot());
    rerender();
    rerender();
    expect(bootFinykDualWriteMock).toHaveBeenCalledTimes(1);
  });
});

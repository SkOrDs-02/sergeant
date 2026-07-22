/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ─── Collaborator mocks ───────────────────────────────────────────────────────

const {
  useFinykSqliteReadBootMock,
  useSqliteReadBootMock,
  bootFinykDualWriteMock,
  bootRoutineDualWriteMock,
  useAuthMock,
} = vi.hoisted(() => ({
  useFinykSqliteReadBootMock: vi.fn(),
  useSqliteReadBootMock: vi.fn(),
  bootFinykDualWriteMock: vi.fn(),
  bootRoutineDualWriteMock: vi.fn(),
  useAuthMock: vi.fn(() => ({ user: null, status: "unauthenticated" })),
}));

vi.mock("../../auth/AuthContext", () => ({
  useAuth: useAuthMock,
}));

vi.mock("../../onboarding/onboardingGate", () => ({
  DEMO_LOCAL_USER_ID: "demo-local",
  isDemoActive: () => false,
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

vi.mock("../../../modules/routine/lib/dualWriteBoot", () => ({
  bootRoutineDualWrite: bootRoutineDualWriteMock,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { useHubChatStorageBoot } from "./useHubChatStorageBoot";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useHubChatStorageBoot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: null, status: "unauthenticated" });
  });

  it("always calls the finyk sqlite read boot", () => {
    renderHook(() => useHubChatStorageBoot());
    expect(useFinykSqliteReadBootMock).toHaveBeenCalled();
  });

  it("always calls the routine sqlite read boot", () => {
    renderHook(() => useHubChatStorageBoot());
    expect(useSqliteReadBootMock).toHaveBeenCalled();
  });

  it("registers dual-write under the anonymous id when user is null", () => {
    // Regression: an anonymous visitor's chat-tool write had no
    // context to apply through and died on reload.
    renderHook(() => useHubChatStorageBoot());

    expect(bootFinykDualWriteMock).toHaveBeenCalledTimes(1);
    expect(bootRoutineDualWriteMock).toHaveBeenCalledTimes(1);
    const { getUserId } = bootRoutineDualWriteMock.mock.calls[0]?.[0] as {
      getUserId: () => string | null;
    };
    expect(getUserId()).toBe("local-anon");
  });

  it("does NOT register dual-write while the session is still resolving", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useAuthMock.mockReturnValue({ user: null, status: "loading" } as any);
    renderHook(() => useHubChatStorageBoot());
    expect(bootFinykDualWriteMock).not.toHaveBeenCalled();
    expect(bootRoutineDualWriteMock).not.toHaveBeenCalled();
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

  it("registers routine dual-write alongside finyk", () => {
    // Regression: the hook warmed the routine READ cache but never
    // registered its write context, so a habit created through a chat
    // tool was lost on reload — `saveRoutineState` has no LS fallback.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useAuthMock.mockReturnValue({ user: { id: "user-abc" } } as any);
    renderHook(() => useHubChatStorageBoot());
    expect(bootRoutineDualWriteMock).toHaveBeenCalledTimes(1);
    const { getUserId } = bootRoutineDualWriteMock.mock.calls[0]?.[0] as {
      getUserId: () => string | null;
    };
    expect(getUserId()).toBe("user-abc");
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
    expect(bootRoutineDualWriteMock).toHaveBeenCalledTimes(1);
  });
});

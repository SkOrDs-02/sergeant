// @vitest-environment jsdom
/**
 * Guards the identity contract every local-first storage boot depends
 * on. See `docs/90-work/planning/specs/anonymous-local-first-persistence.md`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const useAuthMock = vi.fn();
const isDemoActiveMock = vi.fn();

vi.mock("./AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("../onboarding/onboardingGate", () => ({
  DEMO_LOCAL_USER_ID: "demo-local",
  isDemoActive: () => isDemoActiveMock(),
}));

import { LOCAL_ANON_USER_ID, useLocalUserId } from "./useLocalUserId";

beforeEach(() => {
  vi.clearAllMocks();
  isDemoActiveMock.mockReturnValue(false);
});

describe("useLocalUserId", () => {
  it("returns the account id for a signed-in user", () => {
    useAuthMock.mockReturnValue({
      user: { id: "acct-1" },
      status: "authenticated",
    });

    const { result } = renderHook(() => useLocalUserId());

    expect(result.current).toBe("acct-1");
  });

  it("returns the anonymous id when nobody is signed in", () => {
    useAuthMock.mockReturnValue({ user: null, status: "unauthenticated" });

    const { result } = renderHook(() => useLocalUserId());

    expect(result.current).toBe(LOCAL_ANON_USER_ID);
  });

  it("returns null while the session is still resolving", () => {
    // Handing out the anonymous id here would land an authenticated
    // user's first writes in the `anon` SQLite partition, which
    // `setSqliteUser()` then swaps away from.
    useAuthMock.mockReturnValue({ user: null, status: "loading" });

    const { result } = renderHook(() => useLocalUserId());

    expect(result.current).toBeNull();
  });

  it("prefers the demo id over the anonymous id in demo mode", () => {
    useAuthMock.mockReturnValue({ user: null, status: "unauthenticated" });
    isDemoActiveMock.mockReturnValue(true);

    const { result } = renderHook(() => useLocalUserId());

    expect(result.current).toBe("demo-local");
  });

  it("keeps the account id even when the demo flag is still set", () => {
    // Signing in from inside the demo must not scope real writes to
    // the seeded demo rows.
    useAuthMock.mockReturnValue({
      user: { id: "acct-2" },
      status: "authenticated",
    });
    isDemoActiveMock.mockReturnValue(true);

    const { result } = renderHook(() => useLocalUserId());

    expect(result.current).toBe("acct-2");
  });
});

// @vitest-environment jsdom
/**
 * Guards the identity contract every local-first storage boot depends
 * on. See `docs/work/specs/anonymous-local-first-persistence.md`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const useAuthMock = vi.fn();

vi.mock("./AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

import { LOCAL_ANON_USER_ID, useLocalUserId } from "./useLocalUserId";

beforeEach(() => {
  vi.clearAllMocks();
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

  // logic-01: для акаунта у вікні видалення `me` віддає 403, `user` порожній,
  // але сесія жива. Анонімний id тут писав би дані акаунта в анонімну партицію.
  it("returns null for an account in the deletion window (session alive, user unknown)", () => {
    useAuthMock.mockReturnValue({ user: null, status: "pending_deletion" });

    const { result } = renderHook(() => useLocalUserId());

    expect(result.current).toBeNull();
  });
});

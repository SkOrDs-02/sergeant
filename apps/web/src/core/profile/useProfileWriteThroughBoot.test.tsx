// @vitest-environment jsdom
import { vi } from "vitest";
/**
 * `useProfileWriteThroughBoot` — the RQ-backed `GET /api/me/profile` fetch
 * plus the "run reconcile exactly once per authenticated userId" guard.
 * The reconcile logic itself (hydrate vs push, LWW) is covered by
 * `profileWriteThrough.test.ts`; this file only proves the boot wiring.
 */
const { mockUseAuth, mockGetProfile, mockReconcile } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockGetProfile: vi.fn(),
  mockReconcile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: mockUseAuth }));
vi.mock("@shared/api", () => ({ meApi: { getProfile: mockGetProfile } }));
vi.mock("./profileWriteThrough", () => ({
  reconcileBiometricsWithServerProfile: mockReconcile,
}));

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import { useState, type ReactNode } from "react";
import { useProfileWriteThroughBoot } from "./useProfileWriteThroughBoot";

// `useState`'s initializer runs exactly once per mounted component
// instance — so, unlike `new QueryClient(...)` directly in the function
// body, the SAME client survives every `rerender()` call in a test below.
// A fresh client per render would silently hide any regression in the
// user-scoped `hubKeys.profile(userId)` cache key (every render effectively
// starting from an empty cache either way), so this is load-bearing for
// the "does not reuse another user's cached profile" test.
function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockUseAuth.mockReset();
  mockGetProfile.mockReset();
  mockReconcile.mockClear();
  mockGetProfile.mockResolvedValue({ profile: {}, updatedAt: null });
});

describe("useProfileWriteThroughBoot", () => {
  it("does not fetch or reconcile when signed out", async () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderHook(() => useProfileWriteThroughBoot(), { wrapper: Wrapper });

    await new Promise((r) => setTimeout(r, 0));
    expect(mockGetProfile).not.toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("fetches and reconciles once when authenticated, passing the userId through", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-1" } });
    mockGetProfile.mockResolvedValue({
      profile: { heightCm: 180 },
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    renderHook(() => useProfileWriteThroughBoot(), { wrapper: Wrapper });

    await waitFor(() => expect(mockGetProfile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(1));
    expect(mockReconcile).toHaveBeenCalledWith(
      { profile: { heightCm: 180 }, updatedAt: "2026-01-01T00:00:00.000Z" },
      "user-1",
    );
  });

  it("does not reconcile again on a rerender with the same userId", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-1" } });
    const { rerender } = renderHook(() => useProfileWriteThroughBoot(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(1));

    rerender();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockReconcile).toHaveBeenCalledTimes(1);
  });

  it("reconciles again after sign-out then a different sign-in (shared device)", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-1" } });
    const { rerender } = renderHook(() => useProfileWriteThroughBoot(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(1));

    mockUseAuth.mockReturnValue({ user: null });
    rerender();

    mockUseAuth.mockReturnValue({ user: { id: "user-2" } });
    rerender();

    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(2));
  });

  it("re-fetches instead of reusing user-1's cached profile when user-2 signs in on the same client (CodeRabbit PR #627, user-scoped hubKeys.profile)", async () => {
    const user1Profile = {
      profile: { heightCm: 180 },
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const user2Profile = {
      profile: { heightCm: 165 },
      updatedAt: "2026-02-01T00:00:00.000Z",
    };
    mockGetProfile
      .mockResolvedValueOnce(user1Profile)
      .mockResolvedValueOnce(user2Profile);

    mockUseAuth.mockReturnValue({ user: { id: "user-1" } });
    const { rerender } = renderHook(() => useProfileWriteThroughBoot(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(1));
    expect(mockReconcile).toHaveBeenNthCalledWith(1, user1Profile, "user-1");

    mockUseAuth.mockReturnValue({ user: null });
    rerender();

    mockUseAuth.mockReturnValue({ user: { id: "user-2" } });
    rerender();

    await waitFor(() => expect(mockGetProfile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(2));
    // If the query key were still the static `["hub", "profile"]`, React
    // Query would have served user-1's cached response (or never
    // refetched at all) instead of running the queryFn a second time.
    expect(mockReconcile).toHaveBeenNthCalledWith(2, user2Profile, "user-2");
  });
});

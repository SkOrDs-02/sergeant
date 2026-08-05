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
import type { ReactNode } from "react";
import { useProfileWriteThroughBoot } from "./useProfileWriteThroughBoot";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
    renderHook(() => useProfileWriteThroughBoot(), { wrapper });

    await new Promise((r) => setTimeout(r, 0));
    expect(mockGetProfile).not.toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("fetches and reconciles once when authenticated", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-1" } });
    renderHook(() => useProfileWriteThroughBoot(), { wrapper });

    await waitFor(() => expect(mockGetProfile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(1));
  });

  it("does not reconcile again on a rerender with the same userId", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-1" } });
    const { rerender } = renderHook(() => useProfileWriteThroughBoot(), {
      wrapper,
    });

    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(1));

    rerender();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockReconcile).toHaveBeenCalledTimes(1);
  });

  it("reconciles again after sign-out then a different sign-in (shared device)", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-1" } });
    const { rerender } = renderHook(() => useProfileWriteThroughBoot(), {
      wrapper,
    });
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(1));

    mockUseAuth.mockReturnValue({ user: null });
    rerender();

    mockUseAuth.mockReturnValue({ user: { id: "user-2" } });
    rerender();

    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(2));
  });
});

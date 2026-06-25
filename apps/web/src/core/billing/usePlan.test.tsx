/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { BillingStatusResponse } from "@sergeant/shared";

const { statusMock } = vi.hoisted(() => ({
  statusMock:
    vi.fn<
      (opts?: { signal?: AbortSignal }) => Promise<BillingStatusResponse>
    >(),
}));

vi.mock("@shared/api", () => ({
  billingApi: { status: statusMock, createCheckout: vi.fn() },
}));

import { usePlan } from "./usePlan";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("usePlan (web billing skeleton — initiative 0010 Phase 4.1)", () => {
  beforeEach(() => {
    statusMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns plan='free' / isPro=false while the status query is in flight", () => {
    statusMock.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => usePlan(), { wrapper: makeWrapper() });
    expect(result.current.plan).toBe("free");
    expect(result.current.isPro).toBe(false);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.subscription).toBeNull();
  });

  it("collapses an inactive subscription to plan='free' / isPro=false", async () => {
    statusMock.mockResolvedValue({
      subscription: {
        id: null,
        provider: null,
        plan: null,
        status: null,
        active: false,
        currentPeriodEnd: null,
      },
    });
    const { result } = renderHook(() => usePlan(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.plan).toBe("free");
    expect(result.current.isPro).toBe(false);
    expect(result.current.subscription?.active).toBe(false);
  });

  it("returns plan='pro' / isPro=true when active=true on the server response", async () => {
    statusMock.mockResolvedValue({
      subscription: {
        id: 42,
        provider: "stripe",
        plan: "pro",
        status: "active",
        active: true,
        currentPeriodEnd: "2026-06-01T00:00:00.000Z",
      },
    });
    const { result } = renderHook(() => usePlan(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isPro).toBe(true));
    expect(result.current.plan).toBe("pro");
    expect(result.current.subscription?.id).toBe(42);
    expect(result.current.subscription?.currentPeriodEnd).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });

  it("falls back to plan='free' when the request rejects (401 / network) — no retry", async () => {
    statusMock.mockRejectedValue(new Error("Not authenticated"));
    const { result } = renderHook(() => usePlan(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.plan).toBe("free");
    expect(result.current.isPro).toBe(false);
    // retry=false in the hook contract — the mock fires exactly once.
    expect(statusMock).toHaveBeenCalledTimes(1);
  });
});

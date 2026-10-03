// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "@sergeant/api-client";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    silpoApi: {
      syncState: vi.fn(),
      sync: vi.fn(),
      disconnect: vi.fn(),
      wipe: vi.fn(),
      receipts: vi.fn(),
      receiptDetail: vi.fn(),
    },
  };
});

import { silpoApi } from "@shared/api";
import { useSilpoSyncState } from "./useSilpoSyncState";

const mockedSyncState = silpoApi.syncState as unknown as ReturnType<
  typeof vi.fn
>;

function makeWrapper() {
  const client = new QueryClient({
    // `retryDelay: 0` — the "unknown"-error test below exercises the
    // hook's own `retry` predicate (which overrides this `retry: false`
    // default at the query level), so the default exponential backoff
    // would otherwise stretch that one assertion by several seconds.
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("useSilpoSyncState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the connected status and data from the server", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
      lastSyncAt: "2026-08-17T09:15:00.000Z",
      receiptsCount: 5,
    });

    const { result } = renderHook(() => useSilpoSyncState(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.data?.receiptsCount).toBe(5);
    expect(result.current.isError).toBe(false);
  });

  it("maps a 503 SILPO_DISABLED response to the synthetic 'disabled' status without a retry storm", async () => {
    mockedSyncState.mockRejectedValue(
      new ApiError({
        kind: "http",
        message: "Service disabled",
        status: 503,
        body: { code: "SILPO_DISABLED" },
        url: "/api/silpo/sync-state",
      }),
    );

    const { result } = renderHook(() => useSilpoSyncState(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.status).toBe("disabled"));
    expect(result.current.isError).toBe(false);
    expect(mockedSyncState).toHaveBeenCalledTimes(1);
  });

  it("maps any other error to 'unknown' and marks isError true", async () => {
    mockedSyncState.mockRejectedValue(
      new ApiError({
        kind: "network",
        message: "Network down",
        url: "/api/silpo/sync-state",
      }),
    );

    const { result } = renderHook(() => useSilpoSyncState(), {
      wrapper: makeWrapper(),
    });

    // "unknown" is also the status BEFORE the first fetch settles (no data,
    // no error yet) — wait for the query to actually finish failing, not
    // just for the (already-true-at-mount) status string.
    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 5000,
    });
    expect(result.current.status).toBe("unknown");
  });

  it("prioritizes a 503 SILPO_DISABLED refetch error over a stale 'connected' cache", async () => {
    mockedSyncState.mockResolvedValueOnce({
      status: "connected",
      accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
      lastSyncAt: "2026-08-17T09:15:00.000Z",
      receiptsCount: 5,
    });

    const { result } = renderHook(() => useSilpoSyncState(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.status).toBe("connected"));

    mockedSyncState.mockRejectedValueOnce(
      new ApiError({
        kind: "http",
        message: "Service disabled",
        status: 503,
        body: { code: "SILPO_DISABLED" },
        url: "/api/silpo/sync-state",
      }),
    );

    result.current.refetch();

    // `query.data` still holds the stale "connected" payload here (React
    // Query keeps `data` around across a failed refetch) — the kill-switch
    // error must still win over it.
    await waitFor(() => expect(result.current.status).toBe("disabled"));
    expect(result.current.isError).toBe(false);
  });

  it("does not fetch when disabled via the enabled option", () => {
    const { result } = renderHook(() => useSilpoSyncState({ enabled: false }), {
      wrapper: makeWrapper(),
    });

    expect(result.current.status).toBe("unknown");
    expect(mockedSyncState).not.toHaveBeenCalled();
  });
});

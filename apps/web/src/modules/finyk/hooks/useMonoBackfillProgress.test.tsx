// @vitest-environment jsdom
/**
 * Last validated: 2026-06-15
 * Status: Active
 *
 * Hook test (T-7) for `useMonoBackfillProgress`.
 *
 * Verifies the progress-poll hook reads `GET /api/mono/backfill-progress`
 * through the `monoWebhookApi` endpoint, surfaces the snapshot + derived
 * status flags, and respects `enabled: false`. The endpoint is mocked at
 * the `@shared/api` boundary (matching the existing `useMonoTransactions`
 * test style) so the assertion stays on the hook's own logic, not the wire.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { MonoBackfillProgress } from "@shared/api";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    monoWebhookApi: {
      syncState: vi.fn(),
      accounts: vi.fn(),
      transactions: vi.fn(),
      backfill: vi.fn(),
      backfillProgress: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    },
  };
});

import { monoWebhookApi } from "@shared/api";
import { useMonoBackfillProgress } from "./useMonoBackfillProgress";

const mockedProgress = monoWebhookApi.backfillProgress as unknown as ReturnType<
  typeof vi.fn
>;

function idleSnapshot(
  overrides: Partial<MonoBackfillProgress> = {},
): MonoBackfillProgress {
  return {
    status: "idle",
    startedAt: null,
    completedAt: null,
    accountsTotal: 0,
    accountsProcessed: 0,
    currentAccountId: null,
    transactionsProcessed: 0,
    lastError: null,
    ...overrides,
  };
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("useMonoBackfillProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the idle snapshot and exposes isIdle", async () => {
    mockedProgress.mockResolvedValueOnce(idleSnapshot());

    const { result } = renderHook(() => useMonoBackfillProgress(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.progress).not.toBeNull());
    expect(result.current.isIdle).toBe(true);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isCompleted).toBe(false);
    expect(mockedProgress).toHaveBeenCalledTimes(1);
  });

  it("flags a running backfill", async () => {
    mockedProgress.mockResolvedValueOnce(
      idleSnapshot({
        status: "running",
        accountsTotal: 3,
        accountsProcessed: 1,
        startedAt: "2026-01-15T10:00:00.000Z",
      }),
    );

    const { result } = renderHook(() => useMonoBackfillProgress(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isRunning).toBe(true));
    expect(result.current.progress?.accountsProcessed).toBe(1);
    expect(result.current.isIdle).toBe(false);
  });

  it("flags a completed backfill", async () => {
    mockedProgress.mockResolvedValueOnce(
      idleSnapshot({
        status: "completed",
        accountsTotal: 2,
        accountsProcessed: 2,
        completedAt: "2026-01-15T10:05:00.000Z",
        transactionsProcessed: 42,
      }),
    );

    const { result } = renderHook(() => useMonoBackfillProgress(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isCompleted).toBe(true));
    expect(result.current.isRunning).toBe(false);
    expect(result.current.progress?.transactionsProcessed).toBe(42);
  });

  it("does not fetch when disabled", () => {
    const { result } = renderHook(
      () => useMonoBackfillProgress({ enabled: false }),
      { wrapper: makeWrapper() },
    );

    expect(result.current.progress).toBeNull();
    expect(result.current.isIdle).toBe(true);
    expect(mockedProgress).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

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
      connect: vi.fn(),
      disconnect: vi.fn(),
    },
  };
});

import { monoWebhookApi } from "@shared/api";
import { useMonoTransactions } from "./useMonoTransactions";

const mockedTransactions = monoWebhookApi.transactions as unknown as ReturnType<
  typeof vi.fn
>;

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

describe("useMonoTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches transactions from DB endpoint", async () => {
    const txData = [
      {
        userId: "u1",
        monoAccountId: "acc1",
        monoTxId: "tx1",
        time: "2025-01-15T12:00:00Z",
        amount: -1000,
        operationAmount: -1000,
        currencyCode: 980,
        mcc: null,
        originalMcc: null,
        hold: false,
        description: "test",
        comment: null,
        cashbackAmount: null,
        commissionRate: null,
        balance: 100000,
        receiptId: null,
        invoiceId: null,
        counterEdrpou: null,
        counterIban: null,
        counterName: null,
        categorySlug: null,
        categoryOverridden: false,
        source: "webhook" as const,
        receivedAt: "2025-01-15T12:00:01Z",
      },
    ];
    mockedTransactions.mockResolvedValueOnce({
      data: txData,
      nextCursor: null,
    });

    const { result } = renderHook(
      () =>
        useMonoTransactions("2025-01-01", "2025-01-31", "acc1", {
          enabled: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.transactions).toEqual(txData);
    expect(result.current.error).toBeNull();
  });

  it("returns empty array when no data", async () => {
    mockedTransactions.mockResolvedValueOnce({ data: [], nextCursor: null });

    const { result } = renderHook(
      () => useMonoTransactions("2025-01-01", "2025-01-31"),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.transactions).toEqual([]);
  });

  it("does not fetch when disabled", async () => {
    const { result } = renderHook(
      () =>
        useMonoTransactions("2025-01-01", "2025-01-31", undefined, {
          enabled: false,
        }),
      { wrapper: makeWrapper() },
    );

    // Should not trigger a fetch
    expect(result.current.isFetching).toBe(false);
    expect(result.current.transactions).toEqual([]);
    expect(mockedTransactions).not.toHaveBeenCalled();
  });

  it("handles errors gracefully", async () => {
    mockedTransactions.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(
      () => useMonoTransactions("2025-01-01", "2025-01-31"),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isFetching).toBe(false), {
      timeout: 10_000,
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.transactions).toEqual([]);
  });
});

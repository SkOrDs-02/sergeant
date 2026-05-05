// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
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
      connect: vi.fn(),
      disconnect: vi.fn(),
      backfill: vi.fn(),
    },
  };
});

vi.mock("../../../core/observability/analytics", () => ({
  trackEvent: vi.fn(),
  ANALYTICS_EVENTS: {
    BANK_CONNECT_STARTED: "bank_connect_started",
    BANK_CONNECT_SUCCESS: "bank_connect_success",
  },
}));

import { monoWebhookApi } from "@shared/api";
import { useMonobankWebhook } from "./useMonobankWebhook";

const mockedSyncState = monoWebhookApi.syncState as unknown as ReturnType<
  typeof vi.fn
>;
const mockedAccounts = monoWebhookApi.accounts as unknown as ReturnType<
  typeof vi.fn
>;
const mockedTransactions = monoWebhookApi.transactions as unknown as ReturnType<
  typeof vi.fn
>;
const mockedConnect = monoWebhookApi.connect as unknown as ReturnType<
  typeof vi.fn
>;
const mockedDisconnect = monoWebhookApi.disconnect as unknown as ReturnType<
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

describe("useMonobankWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns idle state when disconnected", async () => {
    mockedSyncState.mockResolvedValue({
      status: "disconnected",
      webhookActive: false,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 0,
    });

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("idle");
    });

    expect(result.current.transactions).toEqual([]);
    expect(result.current.clientInfo).toBeNull();
    expect(result.current.token).toBe("");
  });

  it("returns success state when active with transactions", async () => {
    mockedSyncState.mockResolvedValue({
      status: "active",
      webhookActive: true,
      lastEventAt: "2024-01-15T10:00:00Z",
      lastBackfillAt: null,
      accountsCount: 2,
    });
    mockedAccounts.mockResolvedValue([
      {
        userId: "u1",
        monoAccountId: "acc1",
        sendId: null,
        type: "black",
        currencyCode: 980,
        cashbackType: null,
        maskedPan: [],
        iban: null,
        balance: 100000,
        creditLimit: null,
        lastSeenAt: "2024-01-15T10:00:00Z",
      },
    ]);
    mockedTransactions.mockResolvedValue({
      data: [
        {
          userId: "u1",
          monoAccountId: "acc1",
          monoTxId: "tx1",
          time: "2024-01-15T09:00:00Z",
          amount: -5000,
          operationAmount: -5000,
          currencyCode: 980,
          mcc: 5411,
          originalMcc: null,
          hold: false,
          description: "Сільпо",
          comment: null,
          cashbackAmount: 50,
          commissionRate: null,
          balance: 95000,
          receiptId: null,
          invoiceId: null,
          counterEdrpou: null,
          counterIban: null,
          counterName: null,
          categorySlug: null,
          categoryOverridden: false,
          source: "webhook",
          receivedAt: "2024-01-15T09:00:01Z",
        },
      ],
      nextCursor: null,
    });

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });

    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.transactions[0]!.id).toBe("tx1");
    expect(result.current.transactions[0]!.amount).toBe(-5000);
    expect(result.current.clientInfo).not.toBeNull();
    expect(result.current.accounts).toHaveLength(1);
  });

  it("connect sends token to server, does not store in browser", async () => {
    mockedSyncState.mockResolvedValue({
      status: "disconnected",
      webhookActive: false,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 0,
    });
    mockedConnect.mockResolvedValue({ status: "active", accountsCount: 1 });

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("idle");
    });

    await act(async () => {
      await result.current.connect("test-token-123");
    });

    expect(mockedConnect).toHaveBeenCalledWith(
      "test-token-123",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    // Token should NOT be in localStorage or sessionStorage
    expect(localStorage.getItem("finyk_token")).toBeNull();
    expect(localStorage.getItem("finyk_token_remembered")).toBeNull();
    expect(sessionStorage.getItem("finyk_token")).toBeNull();
  });

  it("does not make /api/mono?path=/personal/statement calls in webhook mode", async () => {
    mockedSyncState.mockResolvedValue({
      status: "active",
      webhookActive: true,
      lastEventAt: "2024-01-15T10:00:00Z",
      lastBackfillAt: null,
      accountsCount: 1,
    });
    mockedAccounts.mockResolvedValue([
      {
        userId: "u1",
        monoAccountId: "acc1",
        sendId: null,
        type: "black",
        currencyCode: 980,
        cashbackType: null,
        maskedPan: [],
        iban: null,
        balance: 100000,
        creditLimit: null,
        lastSeenAt: "2024-01-15T10:00:00Z",
      },
    ]);
    mockedTransactions.mockResolvedValue({ data: [], nextCursor: null });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(new Response("[]")));

    renderHook(() => useMonobankWebhook(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(mockedSyncState).toHaveBeenCalled();
    });

    // Verify no direct Monobank API calls were made
    const monoApiCalls = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).includes("/api/mono?path=/personal/statement"),
    );
    expect(monoApiCalls).toHaveLength(0);

    fetchSpy.mockRestore();
  });

  it("disconnect calls server endpoint", async () => {
    mockedSyncState.mockResolvedValue({
      status: "active",
      webhookActive: true,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 1,
    });
    mockedAccounts.mockResolvedValue([]);
    mockedTransactions.mockResolvedValue({ data: [], nextCursor: null });
    mockedDisconnect.mockResolvedValue(undefined);

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });

    await act(async () => {
      await result.current.disconnect();
    });

    expect(mockedDisconnect).toHaveBeenCalled();
  });

  it("preserves return shape compatible with useMonobank", async () => {
    mockedSyncState.mockResolvedValue({
      status: "disconnected",
      webhookActive: false,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 0,
    });

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(mockedSyncState).toHaveBeenCalled();
    });

    // Verify all expected keys from legacy useMonobank exist
    const keys = Object.keys(result.current);
    const requiredKeys = [
      "token",
      "clientInfo",
      "accounts",
      "transactions",
      "realTx",
      "connecting",
      "loadingTx",
      "error",
      "lastUpdated",
      "syncState",
      "authError",
      "setAuthError",
      "connect",
      "refresh",
      "fetchMonth",
      "historyTx",
      "loadingHistory",
      "clearTxCache",
      "disconnect",
    ];
    for (const key of requiredKeys) {
      expect(keys).toContain(key);
    }
  });
});

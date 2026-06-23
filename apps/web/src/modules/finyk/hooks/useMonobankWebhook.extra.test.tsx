// @vitest-environment jsdom
/**
 * Extra coverage for useMonobankWebhook — exercises the callbacks that the
 * primary spec leaves uncovered: refresh, backfill (success + error),
 * clearTxCache, fetchMonth (rejects when disconnected, resolves a normalized
 * month when connected), and the empty-token guard in connect.
 *
 * Heavy/native deps (sqlite mirror, transaction loader) are mocked so the hook
 * runs in jsdom with no DB. Money is integer kopiykas (number).
 */
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

// The hook fetches via this loader, not monoWebhookApi.transactions directly.
const fetchAllMonoTransactions = vi.fn();
vi.mock("./monoTransactionsLoader", () => ({
  fetchAllMonoTransactions: (...args: unknown[]) =>
    fetchAllMonoTransactions(...args),
}));

// Keep the SQLite mirror dormant — the gate stays disabled so the mirror
// write-effects short-circuit before touching getSqliteDb.
vi.mock("../lib/monoMirrorGate", () => ({
  useFinykMonoMirrorGate: () => ({ enabled: false, tick: 0 }),
  notifyFinykMonoMirrorRefresh: vi.fn(),
}));

import { monoWebhookApi } from "@shared/api";
import { useMonobankWebhook } from "./useMonobankWebhook";

const mockedSyncState = monoWebhookApi.syncState as unknown as ReturnType<
  typeof vi.fn
>;
const mockedAccounts = monoWebhookApi.accounts as unknown as ReturnType<
  typeof vi.fn
>;
const mockedBackfill = monoWebhookApi.backfill as unknown as ReturnType<
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

const ACTIVE_STATE = {
  status: "active",
  webhookActive: true,
  lastEventAt: "2026-06-15T10:00:00Z",
  lastBackfillAt: null,
  accountsCount: 1,
};
const DISCONNECTED_STATE = {
  status: "disconnected",
  webhookActive: false,
  lastEventAt: null,
  lastBackfillAt: null,
  accountsCount: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchAllMonoTransactions.mockResolvedValue([]);
  mockedAccounts.mockResolvedValue([]);
});

describe("useMonobankWebhook — extra callbacks", () => {
  it("connect short-circuits on an empty token", async () => {
    mockedSyncState.mockResolvedValue(DISCONNECTED_STATE);
    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      expect(result.current.syncState.status).toBe("idle");
    });
    await act(async () => {
      await result.current.connect("   ");
    });
    expect(result.current.error).toBe("Введи токен");
    expect(monoWebhookApi.connect).not.toHaveBeenCalled();
  });

  it("refresh clears the error without throwing", async () => {
    mockedSyncState.mockResolvedValue(DISCONNECTED_STATE);
    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      expect(result.current.syncState.status).toBe("idle");
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBe("");
  });

  it("backfill posts to the server on success", async () => {
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    mockedBackfill.mockResolvedValue(undefined);
    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });
    await act(async () => {
      await result.current.backfill();
    });
    expect(mockedBackfill).toHaveBeenCalled();
    expect(result.current.error).toBe("");
  });

  it("backfill surfaces the error message on failure", async () => {
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    mockedBackfill.mockRejectedValue(new Error("backfill boom"));
    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });
    await act(async () => {
      await result.current.backfill();
    });
    expect(result.current.error).toBe("backfill boom");
  });

  it("backfill falls back to a generic message for non-Error throws", async () => {
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    mockedBackfill.mockRejectedValue("nope");
    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });
    await act(async () => {
      await result.current.backfill();
    });
    expect(result.current.error).toBe("Помилка backfill");
  });

  it("clearTxCache removes legacy LS caches and clears the error", async () => {
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    localStorage.setItem("finyk_tx_cache", "{}");
    localStorage.setItem("finyk_tx_cache_last_good", "{}");
    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });
    await act(async () => {
      result.current.clearTxCache();
    });
    expect(localStorage.getItem("finyk_tx_cache")).toBeNull();
    expect(localStorage.getItem("finyk_tx_cache_last_good")).toBeNull();
    expect(result.current.error).toBe("");
  });

  it("fetchMonth rejects when not connected", async () => {
    mockedSyncState.mockResolvedValue(DISCONNECTED_STATE);
    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      expect(result.current.syncState.status).toBe("idle");
    });
    await expect(result.current.fetchMonth(2026, 4)).rejects.toThrow(
      /not connected/,
    );
  });

  it("fetchMonth fetches and normalizes a month when connected", async () => {
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    // first call (current-month effect) resolves empty, then the month fetch
    fetchAllMonoTransactions.mockResolvedValue([
      {
        monoTxId: "h1",
        monoAccountId: "acc1",
        time: "2026-05-10T09:00:00Z",
        amount: -12345,
        operationAmount: -12345,
        currencyCode: 980,
        mcc: 5411,
        description: "Травневий запис",
      },
    ]);
    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });
    let month: Awaited<ReturnType<typeof result.current.fetchMonth>> = [];
    await act(async () => {
      month = await result.current.fetchMonth(2026, 4); // May (0-based)
    });
    expect(month).toHaveLength(1);
    expect(month[0]!.id).toBe("h1");
    expect(month[0]!.amount).toBe(-12345);
    expect(result.current.historyTx).toHaveLength(1);
  });
});

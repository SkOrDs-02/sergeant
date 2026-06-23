// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    privatApi: { request: vi.fn() },
  };
});

import { privatApi, ApiError } from "@shared/api";
import { removeItem, writeRaw } from "../lib/finykStorage";
import { usePrivatbank } from "./usePrivatbank";

const PRIVAT_KEYS = [
  "finyk_privat_id",
  "finyk_privat_token",
  "finyk_privat_tx_cache",
  "finyk_privat_balance_cache",
];

const mockedRequest = privatApi.request as unknown as ReturnType<typeof vi.fn>;

const BALANCE_RESPONSE = {
  StatementsResponse: {
    data: [
      {
        acc: "acc-1",
        balance: "1500.50",
        creditLimit: "0",
        currency: "UAH",
        alias: "Картка",
      },
    ],
  },
};

const TX_RESPONSE = {
  StatementsResponse: {
    data: [
      {
        SUM: "-250.00",
        TRANDATE: "05.06.2026",
        TRANTIME: "12:00:00",
        OSND: "Кава",
        REF: "ref-1",
      },
    ],
  },
};

// Default path-dispatching mock so the hook's async auto-reconnect cycle
// (which fires unawaited after `setCredentials`) can never consume a
// `...Once` queue out of order and bleed into the next test.
function installDefaultRequest() {
  mockedRequest.mockImplementation(
    async (_creds: unknown, path: string): Promise<unknown> => {
      if (path.includes("/balance/final")) return BALANCE_RESPONSE;
      if (path.includes("/transactions")) return TX_RESPONSE;
      return { data: [] };
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Clear via the module's storage wrapper so the active KV backing store
  // (SQLite kv_store or raw localStorage) is reset, not just window LS.
  for (const k of PRIVAT_KEYS) removeItem(k);
  localStorage.clear();
  sessionStorage.clear();
  installDefaultRequest();
});

afterEach(() => {
  for (const k of PRIVAT_KEYS) removeItem(k);
});

describe("usePrivatbank", () => {
  it("starts disconnected with no stored credentials", () => {
    const { result } = renderHook(() => usePrivatbank());
    expect(result.current.connected).toBe(false);
    expect(result.current.accounts).toEqual([]);
    expect(result.current.transactions).toEqual([]);
    expect(result.current.syncState.status).toBe("idle");
  });

  it("validates that both id and token are provided", async () => {
    const { result } = renderHook(() => usePrivatbank());
    await act(async () => {
      await result.current.connect("", "");
    });
    expect(result.current.error).toBe("Введи Merchant ID та токен");
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it("connects: fetches balance + transactions and normalizes them", async () => {
    const { result } = renderHook(() => usePrivatbank());
    await act(async () => {
      await result.current.connect("merchant-1", "token-1", true);
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.accounts).toHaveLength(1);
    // 1500.50 grn → kopiykas
    expect(result.current.accounts[0]!.balance).toBe(150050);
    expect(result.current.accounts[0]!.type).toBe("privatbank");
    expect(result.current.transactions).toHaveLength(1);
    // -250.00 grn → -25000 kopiykas
    expect(result.current.transactions[0]!.amount).toBe(-25000);
    expect(result.current.syncState.status).toBe("success");
    expect(result.current.merchantId).toBe("merchant-1");
  });

  it("remember=true persists creds so a fresh mount auto-connects", async () => {
    const first = renderHook(() => usePrivatbank());
    await act(async () => {
      await first.result.current.connect("merchant-1", "token-1", true);
    });

    // A brand-new hook instance loads the remembered creds and reconnects.
    const second = renderHook(() => usePrivatbank());
    await waitFor(() => {
      expect(second.result.current.merchantId).toBe("merchant-1");
    });
  });

  it("surfaces an auth error on 401 and does not connect", async () => {
    const authErr = new ApiError({
      kind: "http",
      status: 401,
      message: "Unauthorized",
      url: "/api/privat/statements/balance/final",
    });
    // Throw only on the balance call (the first request `connect` makes).
    mockedRequest.mockImplementationOnce(async () => {
      throw authErr;
    });

    const { result } = renderHook(() => usePrivatbank());
    await act(async () => {
      await result.current.connect("merchant-1", "token-1");
    });

    expect(result.current.error).toContain("Невірні credentials");
    expect(result.current.connected).toBe(false);
  });

  it("disconnect clears creds, state and caches", async () => {
    const { result } = renderHook(() => usePrivatbank());
    await act(async () => {
      await result.current.connect("merchant-1", "token-1", true);
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.accounts).toEqual([]);
    expect(result.current.transactions).toEqual([]);
    expect(result.current.merchantId).toBe("");
  });

  it("clearCache wipes cached tx/balance and resets lists", async () => {
    const { result } = renderHook(() => usePrivatbank());
    await act(async () => {
      await result.current.connect("merchant-1", "token-1", true);
    });

    act(() => {
      result.current.clearCache();
    });
    expect(result.current.transactions).toEqual([]);
    expect(result.current.accounts).toEqual([]);
    expect(result.current.lastUpdated).toBeNull();
    expect(localStorage.getItem("finyk_privat_tx_cache")).toBeNull();
  });

  it("auto-connects on mount when credentials are already stored", async () => {
    writeRaw("finyk_privat_id", "stored-id");
    writeRaw("finyk_privat_token", "stored-token");

    const { result } = renderHook(() => usePrivatbank());
    await waitFor(() => {
      expect(result.current.accounts).toHaveLength(1);
    });
    expect(result.current.connected).toBe(true);
    expect(result.current.merchantId).toBe("stored-id");
  });

  it("does nothing on mount when disabled", () => {
    writeRaw("finyk_privat_id", "stored-id");
    writeRaw("finyk_privat_token", "stored-token");
    renderHook(() => usePrivatbank(false));
    expect(mockedRequest).not.toHaveBeenCalled();
  });
});

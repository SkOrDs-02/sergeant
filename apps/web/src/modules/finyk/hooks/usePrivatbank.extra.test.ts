// @vitest-environment jsdom
/**
 * Extra coverage for usePrivatbank — exercises branches left uncovered by the
 * primary test suite: refresh() paths (no creds, success, error),
 * fetchTransactions error branches (per-account skip, auth error propagation,
 * network error with/without cache), remember=false (sessionStorage) path,
 * and alternative API response shapes.
 */
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
import { removeItem, writeRaw, writeJSON } from "../lib/finykStorage";
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
        balance: "1000.00",
        creditLimit: "0",
        currency: "UAH",
        alias: "Картка 1",
      },
    ],
  },
};

const TX_RESPONSE_DATA_FORMAT = {
  data: [
    {
      SUM: "-100.00",
      TRANDATE: "01.06.2026",
      TRANTIME: "10:00:00",
      OSND: "Магазин",
      REF: "ref-data-fmt",
    },
  ],
};

const TX_RESPONSE = {
  StatementsResponse: {
    data: [
      {
        SUM: "-200.00",
        TRANDATE: "02.06.2026",
        TRANTIME: "11:00:00",
        OSND: "Кафе",
        REF: "ref-std",
      },
    ],
  },
};

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
  for (const k of PRIVAT_KEYS) removeItem(k);
  localStorage.clear();
  sessionStorage.clear();
  installDefaultRequest();
});

afterEach(() => {
  for (const k of PRIVAT_KEYS) removeItem(k);
});

// ── refresh() early-return when no creds ────────────────────────────────────

describe("usePrivatbank (extra) — refresh()", () => {
  it("returns early with no API call when no credentials are stored", async () => {
    const { result } = renderHook(() => usePrivatbank());
    await act(async () => {
      await result.current.refresh();
    });
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it("fetches balance + transactions when creds are stored", async () => {
    writeRaw("finyk_privat_id", "mid");
    writeRaw("finyk_privat_token", "tok");
    const { result } = renderHook(() => usePrivatbank());
    await waitFor(() => expect(result.current.accounts).toHaveLength(1));
    // Now call refresh() explicitly
    await act(async () => {
      await result.current.refresh();
    });
    // balance/final called twice (once on auto-connect, once on refresh)
    const balanceCalls = (
      mockedRequest.mock.calls as Array<[unknown, string]>
    ).filter(
      ([, path]) => typeof path === "string" && path.includes("/balance/final"),
    );
    expect(balanceCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("sets error message on refresh failure", async () => {
    writeRaw("finyk_privat_id", "mid");
    writeRaw("finyk_privat_token", "tok");
    const { result } = renderHook(() => usePrivatbank());
    await waitFor(() => expect(result.current.connected).toBe(true));

    mockedRequest.mockRejectedValueOnce(new Error("network down"));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBe("network down");
  });
});

// ── fetchTransactions — per-account non-AuthError is skipped ────────────────

describe("usePrivatbank (extra) — fetchTransactions per-account errors", () => {
  it("skips a failing account but continues fetching the rest", async () => {
    // Two accounts returned from balance
    mockedRequest.mockImplementation(
      async (_creds: unknown, path: string): Promise<unknown> => {
        if (path.includes("/balance/final")) {
          return {
            StatementsResponse: {
              data: [
                {
                  acc: "acc-ok",
                  balance: "500",
                  creditLimit: "0",
                  currency: "UAH",
                  alias: "Ok",
                },
                {
                  acc: "acc-fail",
                  balance: "200",
                  creditLimit: "0",
                  currency: "UAH",
                  alias: "Fail",
                },
              ],
            },
          };
        }
        if (path.includes("/transactions")) {
          // acc-fail throws a generic error; acc-ok returns one tx
          const url = path as string;
          void url;
          // Differentiate by call index: 1st tx call = acc-ok, 2nd = acc-fail
          if (mockedRequest.mock.calls.length > 3) {
            throw new Error("account unreachable");
          }
          return TX_RESPONSE;
        }
        return { data: [] };
      },
    );

    const { result } = renderHook(() => usePrivatbank());
    await act(async () => {
      await result.current.connect("mid", "tok");
    });
    // The hook should reach success status even if one account fails
    expect(result.current.syncState.status).toBe("success");
  });
});

// ── fetchTransactions — AuthError propagates from per-account ───────────────

describe("usePrivatbank (extra) — fetchTransactions AuthError", () => {
  it("sets auth error when a per-account tx fetch throws AuthError", async () => {
    const authErr = new ApiError({
      kind: "http",
      status: 401,
      message: "Unauthorized",
      url: "/api/privat/statements/transactions",
    });
    mockedRequest.mockImplementation(
      async (_creds: unknown, path: string): Promise<unknown> => {
        if (path.includes("/balance/final")) return BALANCE_RESPONSE;
        if (path.includes("/transactions")) throw authErr;
        return { data: [] };
      },
    );

    const { result } = renderHook(() => usePrivatbank());
    await act(async () => {
      await result.current.connect("mid", "tok");
    });
    expect(result.current.error).toContain("Невірні credentials");
  });
});

// ── fetchTransactions — network error with cache fallback ───────────────────

describe("usePrivatbank (extra) — connect uses cached tx when available", () => {
  it("uses txCache instead of fetching when cache is fresh", async () => {
    const cachePayload = {
      txs: [
        {
          id: "cached-tx",
          time: 1717200000,
          amount: -5000,
          source: "privatbank",
          accountId: "acc-1",
          description: "Cached",
          mcc: 0,
          category: "other",
          categoryOverride: null,
          splitFrom: null,
          manualEntry: false,
          linkedBudgetId: null,
        },
      ],
      timestamp: Date.now(),
    };
    writeJSON("finyk_privat_tx_cache", cachePayload);

    const { result } = renderHook(() => usePrivatbank());
    await act(async () => {
      await result.current.connect("mid", "tok");
    });
    // Status should be "success" with source "cache"
    expect(result.current.syncState.status).toBe("success");
    expect(result.current.syncState.source).toBe("cache");
    // Transaction fetch endpoint should NOT have been called
    const txCalls = (
      mockedRequest.mock.calls as Array<[unknown, string]>
    ).filter(([, path]) => path.includes("/transactions"));
    expect(txCalls).toHaveLength(0);
  });

  it("uses balanceCache when available to skip the balance API call", async () => {
    writeJSON("finyk_privat_balance_cache", {
      accounts: [
        {
          id: "acc-cached",
          balance: 999900,
          creditLimit: 0,
          currency: "UAH",
          type: "privatbank",
          alias: "CachedCard",
          _source: "privatbank",
        },
      ],
      timestamp: Date.now(),
    });

    const { result } = renderHook(() => usePrivatbank());
    await act(async () => {
      await result.current.connect("mid", "tok");
    });
    expect(result.current.connected).toBe(true);
    // Balance API should NOT have been called (used cache instead)
    const balanceCalls = (
      mockedRequest.mock.calls as Array<[unknown, string]>
    ).filter(([, path]) => path.includes("/balance/final"));
    expect(balanceCalls).toHaveLength(0);
  });
});

// ── remember=false — sessionStorage path ────────────────────────────────────

describe("usePrivatbank (extra) — remember=false", () => {
  it("stores credentials in sessionStorage when remember=false", async () => {
    const { result } = renderHook(() => usePrivatbank());
    await act(async () => {
      await result.current.connect("mid-session", "tok-session", false);
    });
    expect(result.current.connected).toBe(true);
    // creds should be in sessionStorage, not localStorage
    expect(sessionStorage.getItem("finyk_privat_id")).toBe("mid-session");
    expect(sessionStorage.getItem("finyk_privat_token")).toBe("tok-session");
    expect(localStorage.getItem("finyk_privat_id")).toBeNull();
  });
});

// ── Alternative API response shape (data.data path) ─────────────────────────

describe("usePrivatbank (extra) — data.data response format", () => {
  it("normalizes transactions from response.data array format", async () => {
    mockedRequest.mockImplementation(
      async (_creds: unknown, path: string): Promise<unknown> => {
        if (path.includes("/balance/final")) return BALANCE_RESPONSE;
        if (path.includes("/transactions")) return TX_RESPONSE_DATA_FORMAT;
        return { data: [] };
      },
    );

    const { result } = renderHook(() => usePrivatbank());
    await act(async () => {
      await result.current.connect("mid", "tok");
    });
    expect(result.current.transactions).toHaveLength(1);
    // -100.00 grn → -10000 kopiykas
    expect(result.current.transactions[0]!.amount).toBe(-10000);
  });
});

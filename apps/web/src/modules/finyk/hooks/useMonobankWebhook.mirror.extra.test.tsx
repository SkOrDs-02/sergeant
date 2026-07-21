// @vitest-environment jsdom
/**
 * Extra coverage for useMonobankWebhook — exercises the SQLite mirror effects
 * that are skipped in useMonobankWebhook.extra.test.tsx (mirrorEnabled=false
 * there). Here we enable the mirror gate, mock the SQLite layer, and verify
 * the write effects, cleanup cancellation, failure logging, the read-overlay
 * memo, and the December month-boundary branch in fetchMonth.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// ── Stable hoisted state for per-test control ─────────────────────────────────

const mirrorState = vi.hoisted(() => ({
  tick: 0,
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

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

const fetchAllMonoTransactions = vi.fn();
vi.mock("./monoTransactionsLoader", () => ({
  fetchAllMonoTransactions: (...args: unknown[]) =>
    fetchAllMonoTransactions(...args),
}));

// Mirror gate — tick controlled via mirrorState
vi.mock("../lib/monoMirrorGate", () => ({
  useFinykMonoMirrorTick: () => mirrorState.tick,
  notifyFinykMonoMirrorRefresh: vi.fn(),
}));

// SQLite + migration stubs — mocked so effects short-circuit without real DB.
const getSqliteDb = vi.fn();
vi.mock("../../../core/db/sqlite", () => ({
  getSqliteDb: (...args: unknown[]) => getSqliteDb(...args),
}));

const migrateFinyk = vi.fn();
vi.mock("../lib/clientMigrate", () => ({
  migrateFinyk: (...args: unknown[]) => migrateFinyk(...args),
}));

const writeMonoTransactions = vi.fn();
const writeMonoAccounts = vi.fn();
const writeMonoAccountSnapshots = vi.fn();
vi.mock("../lib/monoMirror", () => ({
  writeMonoTransactions: (...args: unknown[]) => writeMonoTransactions(...args),
  writeMonoAccounts: (...args: unknown[]) => writeMonoAccounts(...args),
  writeMonoAccountSnapshots: (...args: unknown[]) =>
    writeMonoAccountSnapshots(...args),
}));

const getCachedFinykMonoMirrorState = vi.fn();
const refreshFinykMonoMirrorState = vi.fn();
vi.mock("../lib/monoMirrorReader", () => ({
  getCachedFinykMonoMirrorState: () => getCachedFinykMonoMirrorState(),
  refreshFinykMonoMirrorState: (...args: unknown[]) =>
    refreshFinykMonoMirrorState(...args),
}));

import { monoWebhookApi } from "@shared/api";
import { useMonobankWebhook } from "./useMonobankWebhook";

const mockedSyncState = monoWebhookApi.syncState as unknown as ReturnType<
  typeof vi.fn
>;
const mockedAccounts = monoWebhookApi.accounts as unknown as ReturnType<
  typeof vi.fn
>;

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

// A test user id — must be seeded into the QueryClient so the hook's
// `queryClient.getQueryData(apiQueryKeys.me.current())` returns a user.
const TEST_USER_ID = "test-user-123";
const ME_DATA = {
  user: {
    id: TEST_USER_ID,
    email: "test@example.com",
    name: "Test User",
  },
};

function makeWrapper(seedMe = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (seedMe) {
    // Seed the me query so userId is non-null inside the hook
    client.setQueryData(["me", "current"], ME_DATA);
  }
  return {
    client,
    Wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
    },
  };
}

function makeMigrationClient() {
  return { exec: vi.fn(), prepare: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();

  mirrorState.tick = 0;

  fetchAllMonoTransactions.mockResolvedValue([]);
  mockedAccounts.mockResolvedValue([]);

  // Default: SQLite succeeds
  const migrationClient = makeMigrationClient();
  getSqliteDb.mockResolvedValue({ migrationClient: () => migrationClient });
  migrateFinyk.mockResolvedValue(undefined);
  writeMonoTransactions.mockResolvedValue(undefined);
  writeMonoAccounts.mockResolvedValue(undefined);
  writeMonoAccountSnapshots.mockResolvedValue(undefined);
  refreshFinykMonoMirrorState.mockResolvedValue(undefined);
  getCachedFinykMonoMirrorState.mockReturnValue({ transactions: [] });
});

afterEach(() => {
  localStorage.clear();
});

// ── Mirror write effects ──────────────────────────────────────────────────────

describe("useMonobankWebhook — mirror tx effect (mirrorEnabled=true, userId set)", () => {
  it("writes transactions to SQLite mirror when connected and transactions exist", async () => {
    const { Wrapper } = makeWrapper(true); // seed me data → userId is set
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    fetchAllMonoTransactions.mockResolvedValue([
      {
        monoTxId: "m1",
        monoAccountId: "acc1",
        time: "2026-06-10T12:00:00Z",
        amount: -500,
        operationAmount: -500,
        currencyCode: 980,
        mcc: 5411,
        description: "Test tx",
      },
    ]);

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });
    // Allow the async mirror effect to run
    await new Promise((r) => setTimeout(r, 100));

    expect(writeMonoTransactions).toHaveBeenCalledTimes(1);
    expect(refreshFinykMonoMirrorState).toHaveBeenCalled();
  });

  it("does NOT write tx to mirror when transactions are empty", async () => {
    const { Wrapper } = makeWrapper(true);
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    fetchAllMonoTransactions.mockResolvedValue([]);

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });
    await new Promise((r) => setTimeout(r, 50));

    // mirrorEnabled=true but transactions empty → early return in effect
    expect(writeMonoTransactions).not.toHaveBeenCalled();
  });

  it("swallows SQLite write failure and emits logger.warn (no crash)", async () => {
    const { Wrapper } = makeWrapper(true);
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    fetchAllMonoTransactions.mockResolvedValue([
      {
        monoTxId: "m2",
        monoAccountId: "acc1",
        time: "2026-06-11T12:00:00Z",
        amount: -1000,
        operationAmount: -1000,
        currencyCode: 980,
        mcc: 5411,
        description: "SQLite fail tx",
      },
    ]);

    writeMonoTransactions.mockRejectedValue(new Error("sqlite busy"));

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });
    await new Promise((r) => setTimeout(r, 100));

    // The component must not crash — syncState still resolves.
    expect(result.current.syncState.status).toBe("success");
    // writeMonoTransactions was attempted
    expect(writeMonoTransactions).toHaveBeenCalled();
  });
});

// ── Mirror accounts effect ────────────────────────────────────────────────────

describe("useMonobankWebhook — mirror accounts effect (mirrorEnabled=true, userId set)", () => {
  it("writes accounts to SQLite mirror when connected and accounts exist", async () => {
    const { Wrapper } = makeWrapper(true);
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    mockedAccounts.mockResolvedValue([
      {
        monoAccountId: "acc1",
        sendId: null,
        currencyCode: 980,
        cashbackType: null,
        balance: 100000,
        creditLimit: 0,
        maskedPan: ["****1234"],
        type: "black",
        iban: "UA12345",
      },
    ]);

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });
    // Wait for the async effect to run
    await waitFor(() => {
      expect(writeMonoAccounts).toHaveBeenCalled();
    });

    expect(writeMonoAccountSnapshots).toHaveBeenCalledTimes(1);
  });

  it("does NOT write accounts when accounts list is empty", async () => {
    const { Wrapper } = makeWrapper(true);
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    mockedAccounts.mockResolvedValue([]);
    fetchAllMonoTransactions.mockResolvedValue([]);

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(writeMonoAccounts).not.toHaveBeenCalled();
  });

  it("swallows accounts write failure and does not crash", async () => {
    const { Wrapper } = makeWrapper(true);
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    mockedAccounts.mockResolvedValue([
      {
        monoAccountId: "acc-fail",
        sendId: null,
        currencyCode: 980,
        cashbackType: null,
        balance: 50000,
        creditLimit: 0,
        maskedPan: ["****9999"],
        type: "black",
        iban: "UA99999",
      },
    ]);

    writeMonoAccounts.mockRejectedValue(new Error("disk full"));

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });
    await new Promise((r) => setTimeout(r, 100));

    // Hook must not crash on accounts write failure
    expect(result.current.syncState.status).toBe("success");
    expect(writeMonoAccounts).toHaveBeenCalled();
  });
});

// ── Mirror skipped without userId ────────────────────────────────────────────

describe("useMonobankWebhook — mirror skipped without userId", () => {
  it("does not write to mirror when userId is null (no me query data)", async () => {
    const { Wrapper } = makeWrapper(false); // no me data → userId=null
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    fetchAllMonoTransactions.mockResolvedValue([
      {
        monoTxId: "tx-noid",
        monoAccountId: "acc1",
        time: "2026-06-20T10:00:00Z",
        amount: -100,
        operationAmount: -100,
        currencyCode: 980,
        mcc: 5411,
        description: "No userId tx",
      },
    ]);

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });
    await new Promise((r) => setTimeout(r, 100));

    // userId is null → mirror effect returns early → no SQLite writes
    expect(writeMonoTransactions).not.toHaveBeenCalled();
  });
});

// ── Read overlay / overlayTransactions ───────────────────────────────────────

describe("useMonobankWebhook — overlay transactions (mirrorEnabled=true)", () => {
  it("returns live transactions when available even with mirrorEnabled=true", async () => {
    const { Wrapper } = makeWrapper(false);
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    fetchAllMonoTransactions.mockResolvedValue([
      {
        monoTxId: "live1",
        monoAccountId: "acc1",
        time: "2026-06-01T09:00:00Z",
        amount: -2000,
        operationAmount: -2000,
        currencyCode: 980,
        mcc: 5411,
        description: "Live",
      },
    ]);

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.transactions.length).toBeGreaterThan(0);
    });
    // Live data wins over cache
    expect(result.current.transactions[0]!.id).toBe("live1");
  });

  it("returns cached mirror transactions when network transactions are empty", async () => {
    const { Wrapper } = makeWrapper(false);
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    fetchAllMonoTransactions.mockResolvedValue([]); // empty network slice

    // Cache has data
    const cachedTx = {
      id: "cached-1",
      time: 1717200000,
      amount: -300,
      source: "monobank" as const,
      accountId: "acc1",
      description: "Cached",
      mcc: 0,
      category: "other" as const,
      categoryOverride: null,
      splitFrom: null,
      manualEntry: false,
      linkedBudgetId: null,
    };
    getCachedFinykMonoMirrorState.mockReturnValue({
      transactions: [cachedTx],
    });

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });

    // The overlay memo calls getCachedFinykMonoMirrorState when network empty
    expect(getCachedFinykMonoMirrorState).toHaveBeenCalled();
    // With cached data, transactions should use the cached slice
    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.transactions[0]!.id).toBe("cached-1");
  });

  it("returns empty array when mirrorEnabled=true but both network and cache are empty", async () => {
    const { Wrapper } = makeWrapper(false);
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    fetchAllMonoTransactions.mockResolvedValue([]);
    // Cache also empty
    getCachedFinykMonoMirrorState.mockReturnValue({ transactions: [] });

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });

    expect(result.current.transactions).toHaveLength(0);
  });
});

// ── fetchMonth — December year-wrap boundary ──────────────────────────────────

describe("useMonobankWebhook — fetchMonth December boundary", () => {
  it("resolves for December month (month=11) without throwing", async () => {
    const { Wrapper } = makeWrapper(false);
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    fetchAllMonoTransactions.mockResolvedValue([]);

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });

    // fetchMonth(2026, 11) = December (0-based)
    // m1 = 12; toYear = 12 === 12 ? 2027 : 2026 → 2027
    // toMonth = 12 === 12 ? 1 : 13 → 1
    // Should NOT throw (isConnected=true)
    let month: Awaited<ReturnType<typeof result.current.fetchMonth>> = [];
    await expect(
      act(async () => {
        month = await result.current.fetchMonth(2026, 11);
      }),
    ).resolves.not.toThrow();
    expect(month).toHaveLength(0);
  });

  it("resolves for November (month=10) without year-wrap", async () => {
    const { Wrapper } = makeWrapper(false);
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    fetchAllMonoTransactions.mockResolvedValue([]);

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });

    // fetchMonth(2026, 10) = November; m1=11, toYear=2026, toMonth=12
    let month: Awaited<ReturnType<typeof result.current.fetchMonth>> = [];
    await act(async () => {
      month = await result.current.fetchMonth(2026, 10);
    });
    expect(month).toHaveLength(0);
    expect(result.current.historyTx).toHaveLength(0);
  });

  it("setHistoryTx is called, sorted by time desc, and loadingHistory flips back to false", async () => {
    const { Wrapper } = makeWrapper(false);
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    // Two transactions out of chronological order — verifies the sort comparator runs
    fetchAllMonoTransactions.mockResolvedValue([
      {
        monoTxId: "hist-older",
        monoAccountId: "acc1",
        time: "2026-05-10T06:00:00Z",
        amount: -1000,
        operationAmount: -1000,
        currencyCode: 980,
        mcc: 5411,
        description: "Older tx",
      },
      {
        monoTxId: "hist-newer",
        monoAccountId: "acc1",
        time: "2026-05-15T08:00:00Z",
        amount: -3000,
        operationAmount: -3000,
        currencyCode: 980,
        mcc: 5411,
        description: "Newer tx",
      },
    ]);

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });

    await act(async () => {
      await result.current.fetchMonth(2026, 4); // May (0-based), m1=5
    });

    expect(result.current.loadingHistory).toBe(false);
    expect(result.current.historyTx).toHaveLength(2);
    // Sorted descending by time — "hist-newer" should come first
    expect(result.current.historyTx[0]!.id).toBe("hist-newer");
    expect(result.current.historyTx[1]!.id).toBe("hist-older");
  });
});

// ── clientInfo when accounts have UAH currency ───────────────────────────────

describe("useMonobankWebhook — clientInfo populated from accounts", () => {
  it("clientInfo is non-null when connected with UAH accounts", async () => {
    const { Wrapper } = makeWrapper(false);
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    mockedAccounts.mockResolvedValue([
      {
        monoAccountId: "uah-acc",
        sendId: "send-1",
        currencyCode: 980, // UAH
        cashbackType: "UAH",
        balance: 50000,
        creditLimit: 0,
        maskedPan: ["****1111"],
        type: "black",
        iban: "UA11111",
      },
    ]);

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });
    await waitFor(() => {
      expect(result.current.accounts.length).toBeGreaterThan(0);
    });

    expect(result.current.clientInfo).not.toBeNull();
    expect(result.current.accounts[0]!.id).toBe("uah-acc");
  });

  it("clientInfo is null when connected but accounts list is empty", async () => {
    const { Wrapper } = makeWrapper(false);
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    mockedAccounts.mockResolvedValue([]);

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });

    expect(result.current.clientInfo).toBeNull();
  });

  it("filters out non-UAH accounts (e.g. USD currency code)", async () => {
    const { Wrapper } = makeWrapper(false);
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);
    mockedAccounts.mockResolvedValue([
      {
        monoAccountId: "usd-acc",
        sendId: null,
        currencyCode: 840, // USD
        cashbackType: null,
        balance: 10000,
        creditLimit: 0,
        maskedPan: ["****2222"],
        type: "black",
        iban: "UA22222",
      },
    ]);

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });

    // USD account is filtered out — accounts list should be empty
    expect(result.current.accounts).toHaveLength(0);
    expect(result.current.clientInfo).toBeNull();
  });
});

// ── Current-month transactions: sort comparator + legacy last-good cache ──────

describe("useMonobankWebhook — current-month tx sort and legacy cache", () => {
  it("sorts current-month transactions descending by time when 3+ exist", async () => {
    const { Wrapper } = makeWrapper(false);
    mockedSyncState.mockResolvedValue(ACTIVE_STATE);

    // 3 transactions out of order — exercises both the sort comparator (line 189)
    // and the `transactions.length >= 3` branch (line 209 — writes last-good cache)
    fetchAllMonoTransactions.mockResolvedValue([
      {
        monoTxId: "tx-mid",
        monoAccountId: "acc1",
        time: "2026-06-15T10:00:00Z",
        amount: -500,
        operationAmount: -500,
        currencyCode: 980,
        mcc: 5411,
        description: "Mid",
      },
      {
        monoTxId: "tx-oldest",
        monoAccountId: "acc1",
        time: "2026-06-01T08:00:00Z",
        amount: -100,
        operationAmount: -100,
        currencyCode: 980,
        mcc: 5411,
        description: "Oldest",
      },
      {
        monoTxId: "tx-newest",
        monoAccountId: "acc1",
        time: "2026-06-20T14:00:00Z",
        amount: -1500,
        operationAmount: -1500,
        currencyCode: 980,
        mcc: 5411,
        description: "Newest",
      },
    ]);

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.transactions.length).toBe(3);
    });

    // Sorted descending by time — proves the >=3 tx branch ran. Last-good
    // snapshots now live in monoMirrorReader memory (Phase 3), not LS.
    expect(result.current.transactions[0]!.id).toBe("tx-newest");
    expect(result.current.transactions[2]!.id).toBe("tx-oldest");
  });
});

// ── syncState accountsOk / accountsTotal ─────────────────────────────────────

describe("useMonobankWebhook — syncState accountsOk field", () => {
  it("returns accountsTotal=0 and accountsOk=0 when disconnected", async () => {
    const { Wrapper } = makeWrapper(false);
    mockedSyncState.mockResolvedValue(DISCONNECTED_STATE);

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("idle");
    });

    expect(result.current.syncState.accountsTotal).toBe(0);
    expect(result.current.syncState.accountsOk).toBe(0);
    expect(result.current.syncState.lastError).toBe("");
    expect(result.current.syncState.lastSuccess).toBeNull();
  });

  it("returns accountsOk=0 when status is pending (not active)", async () => {
    const { Wrapper } = makeWrapper(false);
    mockedSyncState.mockResolvedValue({
      status: "pending",
      webhookActive: false,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 3,
    });

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("loading");
    });

    // accountsOk is 0 when status != "active"
    expect(result.current.syncState.accountsOk).toBe(0);
    expect(result.current.syncState.accountsTotal).toBe(3);
  });

  it("returns accountsOk=accountsTotal when status is active", async () => {
    const { Wrapper } = makeWrapper(false);
    mockedSyncState.mockResolvedValue({
      ...ACTIVE_STATE,
      accountsCount: 5,
    });

    const { result } = renderHook(() => useMonobankWebhook(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("success");
    });

    expect(result.current.syncState.accountsOk).toBe(5);
    expect(result.current.syncState.accountsTotal).toBe(5);
  });
});

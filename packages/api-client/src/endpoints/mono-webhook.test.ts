// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHttpClient } from "../httpClient";
import { createMonoWebhookEndpoints } from "./mono";

type FetchMock = ReturnType<typeof vi.fn>;

let originalFetch: typeof fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("createMonoWebhookEndpoints", () => {
  it("syncState calls GET /api/mono/sync-state", async () => {
    const fetchMock: FetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const syncData = {
      status: "active",
      webhookActive: true,
      lastEventAt: "2025-01-15T00:00:00Z",
      lastBackfillAt: null,
      accountsCount: 2,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(syncData));

    const endpoints = createMonoWebhookEndpoints(createHttpClient());
    const result = await endpoints.syncState();

    expect(result).toEqual(syncData);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/mono/sync-state");
  });

  it("accounts calls GET /api/mono/accounts", async () => {
    const fetchMock: FetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const accounts = [
      {
        userId: "u1",
        monoAccountId: "acc1",
        sendId: null,
        type: "black",
        currencyCode: 980,
        cashbackType: "UAH",
        maskedPan: ["5375****1234"],
        iban: "UA123",
        balance: 10000,
        creditLimit: 0,
        lastSeenAt: "2025-01-01T00:00:00Z",
      },
    ];
    fetchMock.mockResolvedValueOnce(jsonResponse(accounts));

    const endpoints = createMonoWebhookEndpoints(createHttpClient());
    const result = await endpoints.accounts();

    expect(result).toEqual(accounts);
  });

  it("transactions calls GET /api/mono/transactions with params", async () => {
    const fetchMock: FetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const txs = [
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
        source: "webhook",
        receivedAt: "2025-01-15T12:00:01Z",
      },
    ];
    const page = { data: txs, nextCursor: null };
    fetchMock.mockResolvedValueOnce(jsonResponse(page));

    const endpoints = createMonoWebhookEndpoints(createHttpClient());
    const result = await endpoints.transactions({
      from: "2025-01-01",
      to: "2025-01-31",
      accountId: "acc1",
      limit: 10,
    });

    expect(result).toEqual(page);
    const url = new URL(
      fetchMock.mock.calls[0][0] as string,
      "http://localhost",
    );
    expect(url.pathname).toContain("/mono/transactions");
  });

  it("backfill calls POST /api/mono/backfill", async () => {
    const fetchMock: FetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const endpoints = createMonoWebhookEndpoints(createHttpClient());
    await endpoints.backfill();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/mono/backfill");
    expect(init.method).toBe("POST");
  });

  it("backfillProgress calls GET /api/mono/backfill-progress", async () => {
    const fetchMock: FetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const snapshot = {
      status: "running",
      startedAt: "2026-04-01T10:00:00.000Z",
      completedAt: null,
      accountsTotal: 5,
      accountsProcessed: 2,
      currentAccountId: "acc_3",
      transactionsProcessed: 423,
      lastError: null,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(snapshot));

    const endpoints = createMonoWebhookEndpoints(createHttpClient());
    const result = await endpoints.backfillProgress();

    expect(result).toEqual(snapshot);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/mono/backfill-progress");
    // HttpClient defaults GET to no `method` field; explicit POSTs set it.
    expect(init.method ?? "GET").toBe("GET");
  });

  it("connect calls POST /api/mono/connect with token", async () => {
    const fetchMock: FetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: "active", accountsCount: 2 }),
    );

    const endpoints = createMonoWebhookEndpoints(createHttpClient());
    const result = await endpoints.connect("my-token");

    expect(result).toEqual({ status: "active", accountsCount: 2 });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.token).toBe("my-token");
  });

  it("disconnect calls POST /api/mono/disconnect", async () => {
    const fetchMock: FetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const endpoints = createMonoWebhookEndpoints(createHttpClient());
    await endpoints.disconnect();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/mono/disconnect");
    expect(init.method).toBe("POST");
  });
});

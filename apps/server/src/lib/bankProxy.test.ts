import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  recordExternalHttp: vi.fn(),
}));

vi.mock("../obs/logger.js", () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock("./externalHttp.js", () => ({
  recordExternalHttp: mocks.recordExternalHttp,
}));

import {
  __bankProxyTestHooks,
  bankProxyFetch,
  type BankProxyFetchOptions,
} from "./bankProxy.js";

const BASE_OPTS = {
  upstream: "testbank",
  baseUrl: "https://bank.example",
  path: "/personal/client-info",
  headers: { "X-Token": "token" },
} satisfies BankProxyFetchOptions;

function response(
  status: number,
  body: string,
  headers: Record<string, string> = {},
) {
  return new Response(body, { status, headers });
}

function fetchMock() {
  const mock = vi.fn();
  vi.stubGlobal("fetch", mock);
  return mock as Mock;
}

describe("bankProxyFetch", () => {
  beforeEach(() => {
    __bankProxyTestHooks().reset();
    __bankProxyTestHooks().configure({
      retryDelaysMs: [0, 0, 0],
      retryJitterMs: 0,
      cacheTtlMs: 60_000,
    });
    mocks.recordExternalHttp.mockReset();
    mocks.loggerError.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns a successful response and caches identical GET requests", async () => {
    const fetch = fetchMock().mockResolvedValue(
      response(200, '{"ok":true}', {
        "content-type": "application/json",
      }),
    );

    const first = await bankProxyFetch({
      ...BASE_OPTS,
      query: { account: "black" },
      cacheKeySecret: "user-token",
    });
    const second = await bankProxyFetch({
      ...BASE_OPTS,
      query: { account: "black" },
      cacheKeySecret: "user-token",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://bank.example/personal/client-info?account=black",
      expect.objectContaining({
        method: "GET",
        headers: BASE_OPTS.headers,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(first).toEqual({
      status: 200,
      body: '{"ok":true}',
      contentType: "application/json",
      retryAfter: null,
      fromCache: false,
      attempts: 1,
    });
    expect(second).toEqual({ ...first, fromCache: true, attempts: 0 });
    expect(mocks.recordExternalHttp).toHaveBeenCalledWith(
      "testbank",
      "ok",
      expect.any(Number),
    );
    expect(mocks.recordExternalHttp).toHaveBeenCalledWith("testbank", "hit", 0);
  });

  it("does not cache non-GET responses", async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(response(200, "first"))
      .mockResolvedValueOnce(response(200, "second"));

    const first = await bankProxyFetch({ ...BASE_OPTS, method: "POST" });
    const second = await bankProxyFetch({ ...BASE_OPTS, method: "POST" });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(first.body).toBe("first");
    expect(second.body).toBe("second");
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(false);
  });

  it("retries 5xx responses and returns the final successful attempt", async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(response(502, "bad gateway"))
      .mockResolvedValueOnce(response(200, "recovered"));

    const result = await bankProxyFetch(BASE_OPTS);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: 200,
      body: "recovered",
      fromCache: false,
      attempts: 2,
    });
    expect(mocks.recordExternalHttp).toHaveBeenLastCalledWith(
      "testbank",
      "ok",
      expect.any(Number),
    );
  });

  it("returns 429 with Retry-After without tripping the circuit breaker", async () => {
    const fetch = fetchMock().mockResolvedValue(
      response(429, "slow down", {
        "retry-after": "60",
      }),
    );

    const result = await bankProxyFetch(BASE_OPTS);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 429,
      body: "slow down",
      retryAfter: "60",
      attempts: 1,
    });
    expect(mocks.recordExternalHttp).toHaveBeenCalledWith(
      "testbank",
      "rate_limited",
      expect.any(Number),
    );
  });

  it("opens the circuit after repeated upstream 5xx failures", async () => {
    __bankProxyTestHooks().configure({
      retryDelaysMs: [0],
      breakerFailThreshold: 2,
      breakerOpenMs: 30_000,
    });
    const fetch = fetchMock().mockImplementation(() =>
      Promise.resolve(response(503, "unavailable")),
    );

    await bankProxyFetch(BASE_OPTS);
    await bankProxyFetch(BASE_OPTS);
    await expect(bankProxyFetch(BASE_OPTS)).rejects.toMatchObject({
      code: "TESTBANK_CIRCUIT_OPEN",
      status: 503,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.recordExternalHttp).toHaveBeenCalledWith(
      "testbank",
      "circuit_open",
      0,
    );
  });

  it("records and wraps network failures after retries are exhausted", async () => {
    __bankProxyTestHooks().configure({ retryDelaysMs: [0, 0] });
    const networkError = Object.assign(new Error("socket hang up"), {
      code: "ECONNRESET",
    });
    const fetch = fetchMock().mockRejectedValue(networkError);

    await expect(bankProxyFetch(BASE_OPTS)).rejects.toMatchObject({
      code: "TESTBANK_FETCH_FAILED",
      cause: networkError,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.recordExternalHttp).toHaveBeenCalledWith(
      "testbank",
      "error",
      expect.any(Number),
    );
    expect(mocks.loggerError).toHaveBeenCalledWith({
      msg: "testbank_proxy_failed",
      err: { message: "socket hang up", code: "ECONNRESET" },
      attempts: 2,
    });
  });
});

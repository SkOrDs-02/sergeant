import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";
import privatHandler from "./privat.js";
import { bankProxyFetch, __bankProxyTestHooks } from "../../lib/bankProxy.js";

interface TestRes {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
  send(payload: unknown): TestRes;
  setHeader(name: string, value: string): void;
  end(): TestRes;
}

function mockRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end() {
      return this;
    },
  };
  return res as TestRes & Response;
}

function asReq(r: unknown): Request {
  return r as Request;
}

/**
 * Фабрика mock-responses, сумісна з `bankProxyFetch` (потребує .text() і .headers).
 * `body` — або object (серіалізуємо через JSON.stringify), або string.
 */
function mockFetchResponse({
  status = 200,
  body = {} as unknown,
  contentType,
  headers = {},
}: {
  status?: number;
  body?: unknown;
  contentType?: string;
  headers?: Record<string, string>;
} = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const ct =
    contentType ??
    (typeof body === "string" ? "text/plain" : "application/json");
  const normalized = new Map<string, string>();
  for (const [k, v] of Object.entries(headers)) {
    normalized.set(k.toLowerCase(), v);
  }
  normalized.set("content-type", ct);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => (typeof body === "string" ? body : body),
    headers: {
      get: (name: string) => normalized.get(name.toLowerCase()) ?? null,
    },
  };
}

describe("privat proxy path validation", () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    __bankProxyTestHooks().reset();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it("rejects prefix-bypass like /statements/balance/final-evil", async () => {
    const req = {
      method: "GET",
      headers: {
        "x-privat-id": "id",
        "x-privat-token": "tok",
        origin: "http://localhost:5173",
      },
      query: { path: "/statements/balance/final-evil" },
    };
    const res = mockRes();
    await privatHandler(asReq(req), res);
    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects CRLF in merchant headers", async () => {
    const req = {
      method: "GET",
      headers: {
        "x-privat-id": "id\r\nX-Evil: yes",
        "x-privat-token": "tok",
        origin: "http://localhost:5173",
      },
      query: { path: "/statements/balance/final" },
    };
    const res = mockRes();
    await privatHandler(asReq(req), res);
    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("allows /statements/transactions/<acc>", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse({ body: { ok: true } }));
    const req = {
      method: "GET",
      headers: {
        "x-privat-id": "id",
        "x-privat-token": "tok",
        origin: "http://localhost:5173",
      },
      query: { path: "/statements/transactions/UA11" },
    };
    const res = mockRes();
    await privatHandler(asReq(req), res);
    expect(res.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalledOnce();
  });
});

describe("bankProxyFetch — retry + breaker + cache + timeout", () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    __bankProxyTestHooks().reset();
    // У тестах вимикаємо delay-и, щоб не чекати 1с на 3 ретраї.
    __bankProxyTestHooks().configure({
      retryDelaysMs: [0, 0, 0],
      retryJitterMs: 0,
    });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = origFetch;
    __bankProxyTestHooks().reset();
    vi.restoreAllMocks();
  });

  const baseOpts = {
    upstream: "testbank",
    baseUrl: "https://example.test",
    path: "/foo",
    headers: { "X-Key": "k" },
    cacheKeySecret: "secret-a",
  };

  it("returns 2xx on first try — no retry", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse({ body: { ok: 1 } }));
    const r = await bankProxyFetch(baseOpts);
    expect(r.status).toBe(200);
    expect(r.attempts).toBe(1);
    expect(r.fromCache).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 4xx", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse({ status: 401, body: "bad" }));
    const r = await bankProxyFetch({
      ...baseOpts,
      cacheKeySecret: "secret-4xx",
    });
    expect(r.status).toBe(401);
    expect(r.attempts).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 429", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse({ status: 429, body: "rate" }));
    const r = await bankProxyFetch({
      ...baseOpts,
      cacheKeySecret: "secret-429",
    });
    expect(r.status).toBe(429);
    expect(r.attempts).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx up to 3 times", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse({ status: 502, body: "bad gw" }));
    const r = await bankProxyFetch({
      ...baseOpts,
      cacheKeySecret: "secret-5xx",
    });
    expect(r.status).toBe(502);
    expect(r.attempts).toBe(3);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("succeeds on second attempt after transient 503", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockFetchResponse({ status: 503 }))
      .mockResolvedValueOnce(mockFetchResponse({ body: { ok: true } }));
    const r = await bankProxyFetch({
      ...baseOpts,
      cacheKeySecret: "secret-transient",
    });
    expect(r.status).toBe(200);
    expect(r.attempts).toBe(2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("retries network errors and eventually throws ExternalServiceError", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      bankProxyFetch({ ...baseOpts, cacheKeySecret: "secret-net" }),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      code: "TESTBANK_FETCH_FAILED",
    });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("aborts on timeout and surfaces ExternalServiceError", async () => {
    __bankProxyTestHooks().configure({ timeoutMs: 5 });
    global.fetch = vi.fn().mockImplementation(
      (_url: unknown, init: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          init.signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    await expect(
      bankProxyFetch({ ...baseOpts, cacheKeySecret: "secret-timeout" }),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      code: "TESTBANK_FETCH_FAILED",
    });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("caches identical GET — second request does not hit fetch", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse({ body: { hello: "world" } }));
    const r1 = await bankProxyFetch({ ...baseOpts, cacheKeySecret: "cache-a" });
    const r2 = await bankProxyFetch({ ...baseOpts, cacheKeySecret: "cache-a" });
    expect(r1.fromCache).toBe(false);
    expect(r2.fromCache).toBe(true);
    expect(r2.body).toBe(r1.body);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("different cacheKeySecret → different cache entries", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse({ body: { x: 1 } }));
    await bankProxyFetch({ ...baseOpts, cacheKeySecret: "token-A" });
    await bankProxyFetch({ ...baseOpts, cacheKeySecret: "token-B" });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("cache expires after TTL", async () => {
    __bankProxyTestHooks().configure({ cacheTtlMs: 1 });
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse({ body: { ok: 1 } }));
    await bankProxyFetch({ ...baseOpts, cacheKeySecret: "ttl-k" });
    await new Promise((r) => setTimeout(r, 10));
    await bankProxyFetch({ ...baseOpts, cacheKeySecret: "ttl-k" });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT cache 4xx/5xx responses", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse({ status: 401, body: "no" }));
    await bankProxyFetch({ ...baseOpts, cacheKeySecret: "no-cache-err" });
    await bankProxyFetch({ ...baseOpts, cacheKeySecret: "no-cache-err" });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("opens circuit after threshold consecutive 5xx failures, then fast-fails 503", async () => {
    __bankProxyTestHooks().configure({
      breakerFailThreshold: 2,
      breakerOpenMs: 60_000,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse({ status: 500, body: "oops" }));

    // Дві послідовні невдачі (кожна вичерпує 3 HTTP-спроби = 6 fetch-ів).
    const r1 = await bankProxyFetch({ ...baseOpts, cacheKeySecret: "brk-1" });
    expect(r1.status).toBe(500);
    const r2 = await bankProxyFetch({ ...baseOpts, cacheKeySecret: "brk-2" });
    expect(r2.status).toBe(500);
    expect(global.fetch).toHaveBeenCalledTimes(6);

    // Третій запит fast-fail-ить 503 без fetch.
    await expect(
      bankProxyFetch({ ...baseOpts, cacheKeySecret: "brk-3" }),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      status: 503,
      code: "TESTBANK_CIRCUIT_OPEN",
    });
    expect(global.fetch).toHaveBeenCalledTimes(6);
  });

  it("breaker closes (half-open pass) after openMs elapses", async () => {
    __bankProxyTestHooks().configure({
      breakerFailThreshold: 1,
      breakerOpenMs: 5,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockFetchResponse({ status: 500 }))
      .mockResolvedValueOnce(mockFetchResponse({ status: 500 }))
      .mockResolvedValueOnce(mockFetchResponse({ status: 500 }))
      .mockResolvedValue(mockFetchResponse({ body: { recovered: true } }));

    const r1 = await bankProxyFetch({ ...baseOpts, cacheKeySecret: "hopen-1" });
    expect(r1.status).toBe(500);

    // Вікно breaker-а минуло.
    await new Promise((r) => setTimeout(r, 15));

    const r2 = await bankProxyFetch({ ...baseOpts, cacheKeySecret: "hopen-2" });
    expect(r2.status).toBe(200);
  });

  it("breaker does NOT trip on 4xx/429", async () => {
    __bankProxyTestHooks().configure({ breakerFailThreshold: 2 });
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse({ status: 401, body: "nope" }));

    for (let i = 0; i < 5; i++) {
      const r = await bankProxyFetch({
        ...baseOpts,
        cacheKeySecret: `401-${i}`,
      });
      expect(r.status).toBe(401);
    }
    // Усі 5 запитів пройшли — breaker не відкрився.
    expect(global.fetch).toHaveBeenCalledTimes(5);
  });
});

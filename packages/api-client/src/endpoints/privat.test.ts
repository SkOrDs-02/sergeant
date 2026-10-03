// @vitest-environment jsdom
//
// Unit coverage for the `privat` endpoint module — a thin proxy client for
// Privatbank corporate API calls (`GET /api/privat?path=…`). Calls carry NO
// merchant credentials: the server resolves them from `privat_connection` by
// session (spec beta-security-readiness, F1). `balanceFinal` is a canned
// convenience wrapper over the generic `request()` with fixed path + query.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "../httpClient";
import { firstCall } from "../__test-utils/firstCall";
import { createPrivatEndpoints } from "./privat";

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function mockFetchOnce(body: unknown): FetchMock {
  const fn = vi.fn(async () => jsonResponse(body));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

let originalFetch: typeof fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("createPrivatEndpoints.request", () => {
  it("GETs /api/privat with the path + query merged and NO credential headers", async () => {
    const fetchMock = mockFetchOnce({ status: "SUCCESS" });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const privat = createPrivatEndpoints(http);

    const res = await privat.request("/statements/interim", {
      acc: "UA1234",
    });

    expect(res).toEqual({ status: "SUCCESS" });
    const [url, init] = firstCall(fetchMock);
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/api/v1/privat");
    expect(parsed.searchParams.get("path")).toBe("/statements/interim");
    expect(parsed.searchParams.get("acc")).toBe("UA1234");
    // Регресійний якір F1: щойно тут знову зʼявиться токен, він знову
    // муситиме десь зберігатися на клієнті.
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("X-Privat-Id")).toBeNull();
    expect(headers.get("X-Privat-Token")).toBeNull();
  });

  it("works with no extra query params", async () => {
    const fetchMock = mockFetchOnce({ status: "SUCCESS" });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const privat = createPrivatEndpoints(http);

    await privat.request("/statements/balance/final");

    const [url] = firstCall(fetchMock);
    const parsed = new URL(String(url));
    expect(parsed.searchParams.get("path")).toBe("/statements/balance/final");
  });

  it("passes through an AbortSignal", async () => {
    const fetchMock = mockFetchOnce({ status: "SUCCESS" });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const privat = createPrivatEndpoints(http);
    const controller = new AbortController();

    await privat.request("/statements/interim", undefined, {
      signal: controller.signal,
    });

    const [, init] = firstCall(fetchMock);
    expect((init as RequestInit).signal).toBe(controller.signal);
  });
});

describe("createPrivatEndpoints.balanceFinal", () => {
  it("delegates to request() with the fixed balance/final path and country/showRest query", async () => {
    const fetchMock = mockFetchOnce({
      status: "SUCCESS",
      balances: [{ acc: "UA1234", currency: "980" }],
    });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const privat = createPrivatEndpoints(http);

    const res = await privat.balanceFinal();

    expect(res.balances).toHaveLength(1);
    const [url] = firstCall(fetchMock);
    const parsed = new URL(String(url));
    expect(parsed.searchParams.get("path")).toBe("/statements/balance/final");
    expect(parsed.searchParams.get("country")).toBe("UA");
    expect(parsed.searchParams.get("showRest")).toBe("true");
  });

  it("passes through an AbortSignal to the underlying request", async () => {
    const fetchMock = mockFetchOnce({ status: "SUCCESS" });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const privat = createPrivatEndpoints(http);
    const controller = new AbortController();

    await privat.balanceFinal({ signal: controller.signal });

    const [, init] = firstCall(fetchMock);
    expect((init as RequestInit).signal).toBe(controller.signal);
  });
});

describe("createPrivatEndpoints.connect", () => {
  it("POSTs the merchant credentials to /api/privat/connect exactly once (F1)", async () => {
    const fetchMock = mockFetchOnce({ connected: true, merchantId: "m1" });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const privat = createPrivatEndpoints(http);

    const res = await privat.connect({
      merchantId: "m1",
      token: "secret-token",
    });

    expect(res).toEqual({ connected: true, merchantId: "m1" });
    const [url, init] = firstCall(fetchMock);
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/api/v1/privat/connect");
    const reqInit = init as RequestInit;
    expect(reqInit.method).toBe("POST");
    expect(JSON.parse(String(reqInit.body))).toEqual({
      merchantId: "m1",
      token: "secret-token",
    });
  });

  it("passes through an AbortSignal", async () => {
    const fetchMock = mockFetchOnce({ connected: true, merchantId: "m1" });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const privat = createPrivatEndpoints(http);
    const controller = new AbortController();

    await privat.connect(
      { merchantId: "m1", token: "t" },
      { signal: controller.signal },
    );

    const [, init] = firstCall(fetchMock);
    expect((init as RequestInit).signal).toBe(controller.signal);
  });
});

describe("createPrivatEndpoints.disconnect", () => {
  it("POSTs to /api/privat/disconnect with no body", async () => {
    const fetchMock = mockFetchOnce({ connected: false });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const privat = createPrivatEndpoints(http);

    const res = await privat.disconnect();

    expect(res).toEqual({ connected: false });
    const [url, init] = firstCall(fetchMock);
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/api/v1/privat/disconnect");
    const reqInit = init as RequestInit;
    expect(reqInit.method).toBe("POST");
    expect(reqInit.body).toBeUndefined();
  });

  it("passes through an AbortSignal", async () => {
    const fetchMock = mockFetchOnce({ connected: false });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const privat = createPrivatEndpoints(http);
    const controller = new AbortController();

    await privat.disconnect({ signal: controller.signal });

    const [, init] = firstCall(fetchMock);
    expect((init as RequestInit).signal).toBe(controller.signal);
  });
});

describe("createPrivatEndpoints.status", () => {
  it("GETs /api/privat/status and returns the connection status", async () => {
    const fetchMock = mockFetchOnce({ connected: true, merchantId: "m1" });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const privat = createPrivatEndpoints(http);

    const res = await privat.status();

    expect(res).toEqual({ connected: true, merchantId: "m1" });
    const [url, init] = firstCall(fetchMock);
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/api/v1/privat/status");
    expect((init as RequestInit).method ?? "GET").toBe("GET");
  });

  it("passes through an AbortSignal", async () => {
    const fetchMock = mockFetchOnce({ connected: false, merchantId: null });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const privat = createPrivatEndpoints(http);
    const controller = new AbortController();

    await privat.status({ signal: controller.signal });

    const [, init] = firstCall(fetchMock);
    expect((init as RequestInit).signal).toBe(controller.signal);
  });
});

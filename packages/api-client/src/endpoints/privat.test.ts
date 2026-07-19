// @vitest-environment jsdom
//
// Unit coverage for the `privat` endpoint module — a thin proxy client for
// Privatbank corporate API calls (`GET /api/privat?path=…`). All calls carry
// merchant credentials as `X-Privat-Id` / `X-Privat-Token` headers rather
// than in the query string, and `balanceFinal` is a canned convenience
// wrapper over the generic `request()` with fixed path + query.
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

const creds = { merchantId: "merchant-1", merchantToken: "secret-token" };

describe("createPrivatEndpoints.request", () => {
  it("GETs /api/privat with the path + query merged and credential headers set", async () => {
    const fetchMock = mockFetchOnce({ status: "SUCCESS" });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const privat = createPrivatEndpoints(http);

    const res = await privat.request(creds, "/statements/interim", {
      acc: "UA1234",
    });

    expect(res).toEqual({ status: "SUCCESS" });
    const [url, init] = firstCall(fetchMock);
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/api/v1/privat");
    expect(parsed.searchParams.get("path")).toBe("/statements/interim");
    expect(parsed.searchParams.get("acc")).toBe("UA1234");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("X-Privat-Id")).toBe("merchant-1");
    expect(headers.get("X-Privat-Token")).toBe("secret-token");
  });

  it("works with no extra query params", async () => {
    const fetchMock = mockFetchOnce({ status: "SUCCESS" });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const privat = createPrivatEndpoints(http);

    await privat.request(creds, "/statements/balance/final");

    const [url] = firstCall(fetchMock);
    const parsed = new URL(String(url));
    expect(parsed.searchParams.get("path")).toBe("/statements/balance/final");
  });

  it("passes through an AbortSignal", async () => {
    const fetchMock = mockFetchOnce({ status: "SUCCESS" });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const privat = createPrivatEndpoints(http);
    const controller = new AbortController();

    await privat.request(creds, "/statements/interim", undefined, {
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

    const res = await privat.balanceFinal(creds);

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

    await privat.balanceFinal(creds, { signal: controller.signal });

    const [, init] = firstCall(fetchMock);
    expect((init as RequestInit).signal).toBe(controller.signal);
  });
});

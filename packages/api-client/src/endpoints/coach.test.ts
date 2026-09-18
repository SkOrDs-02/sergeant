// @vitest-environment jsdom
//
// Unit coverage for the `coach` endpoint module: three thin wrappers over
// `/api/coach/memory` (GET/POST) and `/api/coach/insight` (POST).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "../httpClient";
import { firstCall } from "../__test-utils/firstCall";
import { createCoachEndpoints } from "./coach";

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

describe("createCoachEndpoints.getMemory", () => {
  it("GETs /api/coach/memory and returns the parsed memory blob", async () => {
    const fetchMock = mockFetchOnce({ memory: { streak: 5 } });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const coach = createCoachEndpoints(http);

    const res = await coach.getMemory();

    expect(res).toEqual({ memory: { streak: 5 } });
    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toBe("https://api.example.com/api/v1/coach/memory");
    expect((init as RequestInit).method ?? "GET").toBe("GET");
  });

  it("returns an empty object shape when the server has no memory yet", async () => {
    mockFetchOnce({});
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const coach = createCoachEndpoints(http);
    const res = await coach.getMemory();
    expect(res.memory).toBeUndefined();
  });
});

describe("createCoachEndpoints.postInsight", () => {
  it("POSTs the snapshot+memory payload to /api/coach/insight", async () => {
    const fetchMock = mockFetchOnce({ insight: "Great progress this week!" });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const coach = createCoachEndpoints(http);

    const payload = { snapshot: { workouts: 3 }, memory: { streak: 5 } };
    const res = await coach.postInsight(payload);

    expect(res).toEqual({ insight: "Great progress this week!" });
    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toBe("https://api.example.com/api/v1/coach/insight");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual(payload);
  });

  it("returns a null insight when the server has nothing to say", async () => {
    mockFetchOnce({ insight: null });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const coach = createCoachEndpoints(http);
    const res = await coach.postInsight({ snapshot: {}, memory: {} });
    expect(res.insight).toBeNull();
  });
});

describe("createCoachEndpoints.postMemory", () => {
  it("POSTs the raw payload to /api/coach/memory and returns the response verbatim", async () => {
    const fetchMock = mockFetchOnce({ ok: true });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const coach = createCoachEndpoints(http);

    const payload = { streak: 6, lastCheckIn: "2026-04-20" };
    const res = await coach.postMemory(payload);

    expect(res).toEqual({ ok: true });
    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toBe("https://api.example.com/api/v1/coach/memory");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual(payload);
  });
});

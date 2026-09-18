// @vitest-environment jsdom
//
// Unit coverage for the `webVitals` endpoint module (`POST
// /api/metrics/web-vitals`, an SSR-/mobile-safe fallback for the
// `navigator.sendBeacon` transport used in the browser). The server always
// answers `204 No Content`, so the module reads the response as text and
// discards it — these tests lock the request shape and the zod validation
// at the client boundary.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "../httpClient";
import { firstCall } from "../__test-utils/firstCall";
import { WebVitalsPayloadSchema, createWebVitalsEndpoints } from "./webVitals";

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetchOnce(status = 204): FetchMock {
  const fn = vi.fn(async () => new Response(null, { status }));
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

const clsMetric = {
  name: "CLS" as const,
  value: 0.05,
  rating: "good" as const,
};
const lcpMetric = {
  name: "LCP" as const,
  value: 1800,
  rating: "good" as const,
};

describe("createWebVitalsEndpoints.send", () => {
  it("POSTs the validated payload to /api/metrics/web-vitals", async () => {
    const fetchMock = mockFetchOnce();
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const webVitals = createWebVitalsEndpoints(http);

    await webVitals.send({ metrics: [clsMetric] });

    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toBe(
      "https://api.example.com/api/v1/metrics/web-vitals",
    );
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      metrics: [clsMetric],
    });
  });

  it("accepts a mix of CLS and timing metrics in one payload", async () => {
    mockFetchOnce();
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const webVitals = createWebVitalsEndpoints(http);
    await expect(
      webVitals.send({ metrics: [clsMetric, lcpMetric] }),
    ).resolves.toBeUndefined();
  });

  it("passes through an AbortSignal", async () => {
    const fetchMock = mockFetchOnce();
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const webVitals = createWebVitalsEndpoints(http);
    const controller = new AbortController();
    await webVitals.send(
      { metrics: [clsMetric] },
      { signal: controller.signal },
    );
    const [, init] = firstCall(fetchMock);
    expect((init as RequestInit).signal).toBe(controller.signal);
  });

  it("rejects a payload with zero metrics via the canonical schema", () => {
    expect(() => WebVitalsPayloadSchema.parse({ metrics: [] })).toThrow();
  });

  it("rejects an unknown metric name via the canonical schema", () => {
    expect(() =>
      WebVitalsPayloadSchema.parse({
        metrics: [{ name: "FID", value: 10, rating: "good" }],
      }),
    ).toThrow();
  });

  it("rejects a CLS value above the sanity ceiling via the canonical schema", () => {
    expect(() =>
      WebVitalsPayloadSchema.parse({
        metrics: [{ name: "CLS", value: 999, rating: "poor" }],
      }),
    ).toThrow();
  });
});

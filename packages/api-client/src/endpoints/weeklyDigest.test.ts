// @vitest-environment jsdom
//
// Unit coverage for the `weeklyDigest` endpoint module (`POST
// /api/weekly-digest`). The module is a thin pass-through — the server
// validates both the request aggregate and Claude's generated report
// against `@sergeant/shared/schemas` — so these tests lock the request
// path/method/body and that the raw JSON response flows back unmodified.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "../httpClient";
import { firstCall } from "../__test-utils/firstCall";
import { createWeeklyDigestEndpoints } from "./weeklyDigest";

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

describe("createWeeklyDigestEndpoints.generate", () => {
  it("POSTs the aggregate payload to /api/weekly-digest and returns the parsed report", async () => {
    const report = {
      wins: ["Consistent workouts"],
      risks: [],
      focus: "Sleep",
      summary: "Solid week overall.",
    };
    const fetchMock = mockFetchOnce(report);
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const weeklyDigest = createWeeklyDigestEndpoints(http);

    const payload = { weekStart: "2026-04-13", stats: { workouts: 3 } };
    const res = await weeklyDigest.generate(payload as never);

    expect(res).toEqual(report);
    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toBe("https://api.example.com/api/v1/weekly-digest");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual(payload);
  });

  it("propagates a server error response as a rejection", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "internal" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const weeklyDigest = createWeeklyDigestEndpoints(http);

    await expect(
      weeklyDigest.generate({ weekStart: "2026-04-13" } as never),
    ).rejects.toBeTruthy();
  });
});

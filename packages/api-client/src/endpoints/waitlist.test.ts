// @vitest-environment jsdom
//
// Unit coverage for the `waitlist` endpoint module (Phase 0 monetization
// rails, `POST /api/v1/waitlist`). Locks the request path/method and the
// response-schema contract so a server regression (e.g. dropping `created`)
// fails at the client boundary rather than silently producing `undefined`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "../httpClient";
import { firstCall } from "../__test-utils/firstCall";
import {
  WaitlistSubmitResponseSchema,
  createWaitlistEndpoints,
} from "./waitlist";

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

describe("createWaitlistEndpoints.submit", () => {
  it("POSTs /api/waitlist with the request body and returns the parsed response", async () => {
    const fetchMock = mockFetchOnce({ ok: true, created: true });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const waitlist = createWaitlistEndpoints(http);

    const res = await waitlist.submit({
      email: "user@example.com",
      tier_interest: "unsure",
      source: "pricing_page",
    });

    expect(res).toEqual({ ok: true, created: true });
    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toBe("https://api.example.com/api/v1/waitlist");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      email: "user@example.com",
    });
  });

  it("returns created=false when the email already exists on the waitlist", async () => {
    mockFetchOnce({ ok: true, created: false });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const waitlist = createWaitlistEndpoints(http);
    const res = await waitlist.submit({ email: "seen@example.com" } as never);
    expect(res.created).toBe(false);
  });

  it("passes through an AbortSignal", async () => {
    const fetchMock = mockFetchOnce({ ok: true, created: true });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const waitlist = createWaitlistEndpoints(http);
    const controller = new AbortController();
    await waitlist.submit({ email: "user@example.com" } as never, {
      signal: controller.signal,
    });
    const [, init] = firstCall(fetchMock);
    expect((init as RequestInit).signal).toBe(controller.signal);
  });

  it("rejects a malformed response missing `created` via the canonical schema", () => {
    expect(() => WaitlistSubmitResponseSchema.parse({ ok: true })).toThrow();
  });

  it("rejects a response with ok: false via the canonical schema", () => {
    expect(() =>
      WaitlistSubmitResponseSchema.parse({ ok: false, created: true }),
    ).toThrow();
  });
});

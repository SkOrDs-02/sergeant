// @vitest-environment jsdom
//
// Unit + contract-fixture coverage for the `billing` endpoint module:
//
//  - `createPortal()` posts to `/api/v1/billing/portal` with an empty body
//    and round-trips the Stripe-portal URL through the zod schema. This
//    locks down the contract end of Hard Rule #3 on the client side; the
//    matching server-side test lives in
//    `apps/server/src/routes/billing.test.ts`.
//  - The schema rejects malformed responses (e.g. missing `url`) so a
//    server-side regression that drops the field would surface as a
//    parsing error rather than an undefined redirect on the web client.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "../httpClient";
import { firstCall } from "../__test-utils/firstCall";
import {
  BillingPortalResponseBodySchema,
  createBillingEndpoints,
} from "./billing";

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

describe("createBillingEndpoints.createPortal", () => {
  it("POSTs /api/v1/billing/portal and returns the parsed portal URL", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      url: "https://billing.stripe.com/session/bps_test_42",
    });

    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const billing = createBillingEndpoints(http);
    const res = await billing.createPortal();

    expect(res).toEqual({
      ok: true,
      url: "https://billing.stripe.com/session/bps_test_42",
    });

    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toBe("https://api.example.com/api/v1/billing/portal");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("rejects malformed portal responses via the canonical schema", () => {
    // Server contract regression-guard: dropping `url` or returning a
    // non-URL string must blow up at the boundary, not silently produce
    // an `undefined` redirect target on the web client.
    expect(() => BillingPortalResponseBodySchema.parse({ ok: true })).toThrow();
    expect(() =>
      BillingPortalResponseBodySchema.parse({
        ok: true,
        url: "not-a-url",
      }),
    ).toThrow();
  });
});

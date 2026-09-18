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
  BillingCancelResponseBodySchema,
  BillingCheckoutResponseBodySchema,
  BillingPortalResponseBodySchema,
  BillingProvidersResponseBodySchema,
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

describe("createBillingEndpoints.createCheckout", () => {
  it("POSTs /api/v1/billing/checkout with the plan and returns the parsed session", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      mode: "test",
      sessionId: "cs_test_123",
      url: "https://checkout.stripe.com/pay/cs_test_123",
    });

    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const billing = createBillingEndpoints(http);
    const res = await billing.createCheckout({ plan: "pro" });

    expect(res).toEqual({
      ok: true,
      mode: "test",
      sessionId: "cs_test_123",
      url: "https://checkout.stripe.com/pay/cs_test_123",
    });
    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toBe("https://api.example.com/api/v1/billing/checkout");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      plan: "pro",
    });
  });

  it("passes through an optional provider and an AbortSignal", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      mode: "live",
      sessionId: "cs_live_1",
      url: "https://checkout.stripe.com/pay/cs_live_1",
    });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const billing = createBillingEndpoints(http);
    const controller = new AbortController();

    await billing.createCheckout(
      { plan: "plus", provider: "liqpay" },
      { signal: controller.signal },
    );

    const [, init] = firstCall(fetchMock);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      plan: "plus",
      provider: "liqpay",
    });
    expect((init as RequestInit).signal).toBe(controller.signal);
  });

  it("rejects a malformed checkout response via the canonical schema", () => {
    expect(() =>
      BillingCheckoutResponseBodySchema.parse({ ok: true, mode: "test" }),
    ).toThrow();
    expect(() =>
      BillingCheckoutResponseBodySchema.parse({
        ok: true,
        mode: "unknown",
        sessionId: "x",
        url: "https://x.example.com",
      }),
    ).toThrow();
  });
});

describe("createBillingEndpoints.status", () => {
  it("GETs /api/v1/billing/status and returns the parsed subscription", async () => {
    const subscription = {
      id: 42,
      provider: "stripe",
      plan: "pro",
      status: "active",
      active: true,
      currentPeriodEnd: "2026-05-20T00:00:00.000Z",
    };
    const fetchMock = mockFetchOnce({ subscription });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const billing = createBillingEndpoints(http);

    const res = await billing.status();

    expect(res).toEqual({ subscription });
    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toBe("https://api.example.com/api/v1/billing/status");
    expect((init as RequestInit).method ?? "GET").toBe("GET");
  });

  it("returns a null subscription (no active plan) verbatim", async () => {
    const subscription = {
      id: null,
      provider: null,
      plan: null,
      status: null,
      active: false,
      currentPeriodEnd: null,
    };
    mockFetchOnce({ subscription });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const billing = createBillingEndpoints(http);
    const res = await billing.status();
    expect(res.subscription.active).toBe(false);
  });

  it("passes through an AbortSignal", async () => {
    const fetchMock = mockFetchOnce({
      subscription: {
        id: null,
        provider: null,
        plan: null,
        status: null,
        active: false,
        currentPeriodEnd: null,
      },
    });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const billing = createBillingEndpoints(http);
    const controller = new AbortController();
    await billing.status({ signal: controller.signal });
    const [, init] = firstCall(fetchMock);
    expect((init as RequestInit).signal).toBe(controller.signal);
  });
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

describe("createBillingEndpoints.cancel", () => {
  it("POSTs /api/v1/billing/cancel with an empty body", async () => {
    const fetchMock = mockFetchOnce({ ok: true });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const billing = createBillingEndpoints(http);
    const res = await billing.cancel();
    expect(res).toEqual({ ok: true });
    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toBe("https://api.example.com/api/v1/billing/cancel");
    expect((init as RequestInit).method).toBe("POST");
  });
});

describe("createBillingEndpoints.providers", () => {
  it("GETs /api/v1/billing/providers and parses the enabled list", async () => {
    const fetchMock = mockFetchOnce({ providers: ["liqpay", "plata"] });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const billing = createBillingEndpoints(http);
    const res = await billing.providers();
    expect(res).toEqual({ providers: ["liqpay", "plata"] });
    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toBe(
      "https://api.example.com/api/v1/billing/providers",
    );
    expect((init as RequestInit).method ?? "GET").toBe("GET");
  });

  it("rejects an unknown provider id via the canonical schema", () => {
    expect(() =>
      BillingProvidersResponseBodySchema.parse({ providers: ["paypal"] }),
    ).toThrow();
    expect(() =>
      BillingCancelResponseBodySchema.parse({ ok: false }),
    ).toThrow();
  });
});

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
import { isApiError } from "../ApiError";
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

// Знімок доступу (`docs/work/specs/access-tiers.md`): обовʼязкове поле
// відповіді, без нього схема відкидає тіло.
const ACCESS = {
  state: "free",
  trialEndsAt: null,
  graceEndsAt: null,
  features: { "export.pdf": false, "ai.photo": true },
  meters: {
    aiActions: { used: 3, limit: 20, resetsAt: "2026-06-14T21:00:00.000Z" },
    aiPhoto: { used: 0, limit: 3, resetsAt: "2026-06-14T21:00:00.000Z" },
    finykVision: { used: 0, limit: 5, resetsAt: "2026-06-14T21:00:00.000Z" },
  },
};

describe("createBillingEndpoints.status", () => {
  it("GETs /api/v1/billing/status and returns the parsed subscription", async () => {
    const subscription = {
      id: 42,
      provider: "stripe",
      plan: "pro",
      status: "active",
      active: true,
      currentPeriodEnd: "2026-05-20T00:00:00.000Z",
      cancelAtPeriodEnd: true,
    };
    const fetchMock = mockFetchOnce({ subscription, access: ACCESS });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const billing = createBillingEndpoints(http);

    const res = await billing.status();

    expect(res).toEqual({ subscription, access: ACCESS });
    expect(res.subscription.cancelAtPeriodEnd).toBe(true);
    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toBe("https://api.example.com/api/v1/billing/status");
    expect((init as RequestInit).method ?? "GET").toBe("GET");
  });

  // Rolling deploy: web (Vercel) і сервер (Coolify) викочуються окремо, тож
  // новий клієнт читає відповідь старого сервера без `cancelAtPeriodEnd`.
  // Схема мусить не кидати, а читати це як «не скасовано».
  it("defaults cancelAtPeriodEnd to false when an older server omits it", async () => {
    mockFetchOnce({
      subscription: {
        id: 42,
        provider: "liqpay",
        plan: "pro",
        status: "active",
        active: true,
        currentPeriodEnd: "2026-05-20T00:00:00.000Z",
      },
      access: ACCESS,
    });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const billing = createBillingEndpoints(http);

    const res = await billing.status();

    expect(res.subscription.cancelAtPeriodEnd).toBe(false);
  });

  it("rejects a non-boolean cancelAtPeriodEnd", async () => {
    mockFetchOnce({
      subscription: {
        id: 42,
        provider: "liqpay",
        plan: "pro",
        status: "active",
        active: true,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: "yes",
      },
      access: ACCESS,
    });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const billing = createBillingEndpoints(http);
    await expect(billing.status()).rejects.toThrow();
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
    mockFetchOnce({ subscription, access: ACCESS });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const billing = createBillingEndpoints(http);
    const res = await billing.status();
    expect(res.subscription.active).toBe(false);
  });

  it("rejects a status response without the access snapshot", async () => {
    mockFetchOnce({
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
    await expect(billing.status()).rejects.toThrow();
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
      access: ACCESS,
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

  it.each([
    [409, "NO_ACTIVE_SUBSCRIPTION"],
    [502, "PROVIDER_CANCEL_FAILED"],
  ])(
    "surfaces a %i %s response as an ApiError instead of a fake success",
    async (status, code) => {
      globalThis.fetch = vi.fn(async () =>
        jsonResponse({ error: "nope", code }, { status }),
      ) as unknown as typeof fetch;
      const http = createHttpClient({ baseUrl: "https://api.example.com" });
      const billing = createBillingEndpoints(http);

      let caught: unknown;
      try {
        await billing.cancel();
      } catch (err) {
        caught = err;
      }

      expect(isApiError(caught)).toBe(true);
      if (!isApiError(caught)) return;
      expect(caught.status).toBe(status);
      expect(caught.body).toMatchObject({ code });
    },
  );
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

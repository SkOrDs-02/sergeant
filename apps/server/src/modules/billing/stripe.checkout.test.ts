// Coverage for the Stripe checkout/portal/status functions in stripe.ts.
//
// stripe.test.ts already covers processStripeWebhook/verifyStripeSignature
// (re-exported from stripeWebhook.ts) but never touches createCheckoutSession,
// createCustomerPortalSession, or getSubscriptionStatus — the functions
// actually defined in this file. This file mocks the parsed `env` singleton
// (read at import time, so process.env mutation post-import wouldn't help —
// mirrors the pattern in plataScheduler.test.ts) and `fetch` to exercise them
// without a real Stripe account.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockEnv = vi.hoisted(() => ({}) as Record<string, any>);

// Spread the real parsed `env` (so unrelated fields logger.ts/etc. depend on
// stay intact) and only override the two Stripe fields under test per-case —
// `env` is parsed once at import time, so mutating `process.env` afterwards
// would not help (mirrors the pattern in plataScheduler.test.ts).
vi.mock("../../env/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../env/env.js")>();
  Object.assign(mockEnv, actual.env);
  return {
    ...actual,
    get env() {
      return mockEnv;
    },
  };
});

import {
  createCheckoutSession,
  createCustomerPortalSession,
  getSubscriptionStatus,
  BillingConfigurationError,
  NoBillingCustomerError,
} from "./stripe.js";

beforeEach(() => {
  mockEnv["STRIPE_SECRET_KEY"] = undefined;
  mockEnv["STRIPE_PRICE_ID_PRO_MONTHLY"] = undefined;
  delete process.env["PUBLIC_WEB_BASE_URL"];
  delete process.env["VITE_PUBLIC_APP_URL"];
  delete process.env["BETTER_AUTH_URL"];
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createCheckoutSession", () => {
  it("throws BillingConfigurationError when STRIPE_SECRET_KEY is unset", async () => {
    const pool = { query: vi.fn() } as never;
    await expect(
      createCheckoutSession({ pool, user: { id: "user_1" }, plan: "pro" }),
    ).rejects.toBeInstanceOf(BillingConfigurationError);
  });

  it("throws BillingConfigurationError when STRIPE_PRICE_ID_PRO_MONTHLY is unset", async () => {
    mockEnv["STRIPE_SECRET_KEY"] = "sk_test_abc";
    const pool = { query: vi.fn() } as never;
    await expect(
      createCheckoutSession({ pool, user: { id: "user_1" }, plan: "pro" }),
    ).rejects.toBeInstanceOf(BillingConfigurationError);
  });

  it("creates a test-mode checkout session and posts the expected fields", async () => {
    mockEnv["STRIPE_SECRET_KEY"] = "sk_test_abc";
    mockEnv["STRIPE_PRICE_ID_PRO_MONTHLY"] = "price_pro_monthly";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "cs_test_1",
          url: "https://checkout.stripe.com/cs_test_1",
          customer: "cus_1",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pool = { query: vi.fn() } as never;
    const result = await createCheckoutSession({
      pool,
      user: { id: "user_1", email: "user1@example.com" },
      plan: "pro",
    });

    expect(result).toEqual({
      ok: true,
      mode: "test",
      sessionId: "cs_test_1",
      url: "https://checkout.stripe.com/cs_test_1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer sk_test_abc",
    );
    const body = new URLSearchParams(init.body as string);
    expect(body.get("client_reference_id")).toBe("user_1");
    expect(body.get("customer_email")).toBe("user1@example.com");
    expect(body.get("line_items[0][price]")).toBe("price_pro_monthly");
    expect(body.get("metadata[plan]")).toBe("pro");
  });

  it("reports live mode for an sk_live_ secret key", async () => {
    mockEnv["STRIPE_SECRET_KEY"] = "sk_live_abc";
    mockEnv["STRIPE_PRICE_ID_PRO_MONTHLY"] = "price_pro_monthly";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              id: "cs_1",
              url: "https://checkout.stripe.com/cs_1",
            }),
            { status: 200 },
          ),
        ),
    );
    const pool = { query: vi.fn() } as never;

    const result = await createCheckoutSession({
      pool,
      user: { id: "user_1" },
      plan: "pro",
    });

    expect(result.mode).toBe("live");
  });

  it("omits customer_email from the request body when the user has no email", async () => {
    mockEnv["STRIPE_SECRET_KEY"] = "sk_test_abc";
    mockEnv["STRIPE_PRICE_ID_PRO_MONTHLY"] = "price_pro_monthly";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "cs_1",
            url: "https://checkout.stripe.com/cs_1",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const pool = { query: vi.fn() } as never;

    await createCheckoutSession({ pool, user: { id: "user_1" }, plan: "pro" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.has("customer_email")).toBe(false);
  });

  it("throws with the Stripe error message when the API call fails", async () => {
    mockEnv["STRIPE_SECRET_KEY"] = "sk_test_abc";
    mockEnv["STRIPE_PRICE_ID_PRO_MONTHLY"] = "price_pro_monthly";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "card issue" } }), {
          status: 402,
        }),
      ),
    );
    const pool = { query: vi.fn() } as never;

    await expect(
      createCheckoutSession({ pool, user: { id: "user_1" }, plan: "pro" }),
    ).rejects.toThrow("card issue");
  });

  it("falls back to a generic error message when Stripe returns no message", async () => {
    mockEnv["STRIPE_SECRET_KEY"] = "sk_test_abc";
    mockEnv["STRIPE_PRICE_ID_PRO_MONTHLY"] = "price_pro_monthly";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({}), { status: 500 })),
    );
    const pool = { query: vi.fn() } as never;

    await expect(
      createCheckoutSession({ pool, user: { id: "user_1" }, plan: "pro" }),
    ).rejects.toThrow("Stripe checkout failed");
  });
});

describe("createCustomerPortalSession", () => {
  it("throws BillingConfigurationError before touching the DB when unconfigured", async () => {
    const query = vi.fn();
    await expect(
      createCustomerPortalSession({
        pool: { query } as never,
        userId: "user_1",
      }),
    ).rejects.toBeInstanceOf(BillingConfigurationError);
    expect(query).not.toHaveBeenCalled();
  });

  it("throws NoBillingCustomerError when the user has no eligible subscription row", async () => {
    mockEnv["STRIPE_SECRET_KEY"] = "sk_test_abc";
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(
      createCustomerPortalSession({
        pool: { query } as never,
        userId: "user_1",
      }),
    ).rejects.toBeInstanceOf(NoBillingCustomerError);
  });

  it("creates a portal session for the most-recently-updated eligible customer", async () => {
    mockEnv["STRIPE_SECRET_KEY"] = "sk_test_abc";
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [{ provider_customer_id: "cus_42" }] });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "bps_1",
          url: "https://billing.stripe.com/session/bps_1",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createCustomerPortalSession({
      pool: { query } as never,
      userId: "user_1",
    });

    expect(result).toEqual({
      ok: true,
      url: "https://billing.stripe.com/session/bps_1",
    });
    const [sqlText, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sqlText).toContain("FROM subscriptions");
    expect(params).toEqual(["user_1", ["active", "trialing", "past_due"]]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("customer")).toBe("cus_42");
  });

  it("propagates the Stripe error message when portal session creation fails", async () => {
    mockEnv["STRIPE_SECRET_KEY"] = "sk_test_abc";
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [{ provider_customer_id: "cus_42" }] });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "no such customer" } }),
          {
            status: 404,
          },
        ),
      ),
    );

    await expect(
      createCustomerPortalSession({
        pool: { query } as never,
        userId: "user_1",
      }),
    ).rejects.toThrow("no such customer");
  });
});

describe("getSubscriptionStatus", () => {
  it("serializes an active subscription row with a coerced numeric id", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "123",
          provider: "stripe",
          plan: "pro",
          status: "active",
          current_period_end: new Date("2026-08-01T00:00:00.000Z"),
        },
      ],
    });

    const result = await getSubscriptionStatus({ query } as never, "user_1");

    expect(result).toEqual({
      subscription: {
        id: 123,
        provider: "stripe",
        plan: "pro",
        status: "active",
        active: true,
        currentPeriodEnd: "2026-08-01T00:00:00.000Z",
      },
    });
    expect(typeof result.subscription.id).toBe("number");
  });

  it("marks trialing as active and canceled as inactive", async () => {
    const trialing = await getSubscriptionStatus(
      {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              id: 1,
              provider: "stripe",
              plan: "pro",
              status: "trialing",
              current_period_end: null,
            },
          ],
        }),
      } as never,
      "user_1",
    );
    expect(trialing.subscription.active).toBe(true);
    expect(trialing.subscription.currentPeriodEnd).toBeNull();

    const canceled = await getSubscriptionStatus(
      {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              id: 2,
              provider: "stripe",
              plan: "pro",
              status: "canceled",
              current_period_end: null,
            },
          ],
        }),
      } as never,
      "user_1",
    );
    expect(canceled.subscription.active).toBe(false);
  });

  it("returns the empty/null shape when the user has no subscription row", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    const result = await getSubscriptionStatus({ query } as never, "user_1");

    expect(result).toEqual({
      subscription: {
        id: null,
        provider: null,
        plan: null,
        status: null,
        active: false,
        currentPeriodEnd: null,
      },
    });
  });
});

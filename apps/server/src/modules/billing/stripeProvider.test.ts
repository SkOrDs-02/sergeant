import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BillingProvider, ProviderCheckoutInput } from "./provider.js";

const mockStripe = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  createCustomerPortalSession: vi.fn(),
  getSubscriptionStatus: vi.fn(),
  processStripeWebhook: vi.fn(),
  verifyStripeSignature: vi.fn(),
}));

vi.mock("./stripe.js", () => mockStripe);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockEnv = vi.hoisted(() => ({}) as Record<string, any>);
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

const { stripeProvider } = await import("./stripeProvider.js");

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("stripeProvider adapter", () => {
  it("implements the full BillingProvider contract (dormant, Phase 7)", () => {
    // Compile-time контракт + runtime-перевірка, що жоден метод не забутий.
    const p: BillingProvider = stripeProvider;
    expect(p.id).toBe("stripe");
    for (const method of [
      "createCheckoutSession",
      "createCustomerPortalSession",
      "getSubscriptionStatus",
      "verifyWebhookSignature",
      "processWebhook",
      "cancelSubscription",
    ] as const) {
      expect(typeof p[method]).toBe("function");
    }
  });

  it("cancelSubscription is a no-op when the user has no Stripe row", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = { query } as any;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      stripeProvider.cancelSubscription(pool, "user_1"),
    ).resolves.toBeUndefined();
    // Ніякого виклику Stripe API без наявної підписки.
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("cancelSubscription is a no-op when STRIPE_SECRET_KEY is unset even with a subscription row", async () => {
    mockEnv["STRIPE_SECRET_KEY"] = undefined;
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [{ provider_subscription_id: "sub_1" }] });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stripeProvider.cancelSubscription({ query } as any, "user_1"),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("cancelSubscription sets cancel_at_period_end via Stripe API then updates the DB row", async () => {
    mockEnv["STRIPE_SECRET_KEY"] = "sk_test_abc";
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ provider_subscription_id: "sub_1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "sub_1" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await stripeProvider.cancelSubscription({ query } as any, "user_1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/subscriptions/sub_1");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer sk_test_abc",
    );
    const body = new URLSearchParams(init.body as string);
    expect(body.get("cancel_at_period_end")).toBe("true");

    expect(query).toHaveBeenCalledTimes(2);
    const [updateSql, updateParams] = query.mock.calls[1] as [
      string,
      unknown[],
    ];
    expect(updateSql).toContain("UPDATE subscriptions");
    expect(updateParams).toEqual(["user_1"]);
  });

  it("cancelSubscription throws when the Stripe cancel call fails", async () => {
    mockEnv["STRIPE_SECRET_KEY"] = "sk_test_abc";
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ provider_subscription_id: "sub_1" }] });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
    );

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stripeProvider.cancelSubscription({ query } as any, "user_1"),
    ).rejects.toThrow("Stripe cancel failed: HTTP 500");
    // No DB update on failure — only the initial SELECT.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("createCheckoutSession delegates to stripe.createCheckoutSession", async () => {
    mockStripe.createCheckoutSession.mockResolvedValue({
      ok: true,
      mode: "test",
      sessionId: "cs_1",
      url: "https://checkout.stripe.com/cs_1",
    });
    const input: ProviderCheckoutInput = {
      pool: {} as ProviderCheckoutInput["pool"],
      user: { id: "user_1" },
      plan: "pro" as const,
    };

    const result = await stripeProvider.createCheckoutSession(input);

    expect(mockStripe.createCheckoutSession).toHaveBeenCalledWith(input);
    expect(result.sessionId).toBe("cs_1");
  });

  it("createCustomerPortalSession delegates with pool + user.id", async () => {
    mockStripe.createCustomerPortalSession.mockResolvedValue({
      ok: true,
      url: "https://billing.stripe.com/x",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = {} as any;

    const result = await stripeProvider.createCustomerPortalSession({
      pool,
      user: { id: "user_9" },
    });

    expect(mockStripe.createCustomerPortalSession).toHaveBeenCalledWith({
      pool,
      userId: "user_9",
    });
    expect(result.url).toBe("https://billing.stripe.com/x");
  });

  it("getSubscriptionStatus delegates to stripe.getSubscriptionStatus", async () => {
    mockStripe.getSubscriptionStatus.mockResolvedValue({
      subscription: {
        id: null,
        provider: null,
        plan: null,
        status: null,
        active: false,
        currentPeriodEnd: null,
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = {} as any;

    await stripeProvider.getSubscriptionStatus(pool, "user_1");

    expect(mockStripe.getSubscriptionStatus).toHaveBeenCalledWith(
      pool,
      "user_1",
    );
  });

  it("verifyWebhookSignature converts the raw body string to a Buffer", () => {
    mockStripe.verifyStripeSignature.mockReturnValue(true);

    const result = stripeProvider.verifyWebhookSignature("{}", "t=1,v1=abc");

    expect(result).toBe(true);
    const [buf, sig] = mockStripe.verifyStripeSignature.mock.calls[0] as [
      Buffer,
      string,
    ];
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString("utf8")).toBe("{}");
    expect(sig).toBe("t=1,v1=abc");
  });

  it("processWebhook parses the body and forwards {id, type, data} to processStripeWebhook", async () => {
    mockStripe.processStripeWebhook.mockResolvedValue({
      ok: true,
      duplicate: false,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = {} as any;
    const rawBody = JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1" } },
    });

    await stripeProvider.processWebhook(pool, rawBody);

    expect(mockStripe.processStripeWebhook).toHaveBeenCalledTimes(1);
    const [calledPool, event, raw] = mockStripe.processStripeWebhook.mock
      .calls[0] as [unknown, unknown, Buffer];
    expect(calledPool).toBe(pool);
    expect(event).toEqual({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1" } },
    });
    expect(Buffer.isBuffer(raw)).toBe(true);
  });

  it("processWebhook omits `data` when the parsed event has no object-shaped data", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = {} as any;
    const rawBody = JSON.stringify({ id: "evt_2", type: "ping" });

    await stripeProvider.processWebhook(pool, rawBody);

    const [, event] = mockStripe.processStripeWebhook.mock.calls[0] as [
      unknown,
      unknown,
    ];
    expect(event).toEqual({ id: "evt_2", type: "ping" });
  });

  it("processWebhook is a no-op when id or type is missing/non-string", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = {} as any;

    await stripeProvider.processWebhook(pool, JSON.stringify({ type: "ping" }));
    await stripeProvider.processWebhook(
      pool,
      JSON.stringify({ id: 123, type: "ping" }),
    );
    await stripeProvider.processWebhook(pool, JSON.stringify({ id: "evt_1" }));

    expect(mockStripe.processStripeWebhook).not.toHaveBeenCalled();
  });
});
